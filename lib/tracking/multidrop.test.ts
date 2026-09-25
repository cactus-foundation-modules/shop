import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { furthestStage, isMultidropUrl, parseMultidropStages } from '@/modules/shop/lib/tracking/multidrop'

// The real page, saved from a real delivery on 7 September 2026 rather than
// written by hand. A fixture somebody typed out tests the parser against their
// own idea of the markup, which is exactly the thing that turns out to be wrong.
const REAL_PAGE = readFileSync(
  path.join(__dirname, '__fixtures__', 'multidrop-timeline.html'),
  'utf8',
)

// The same delivery once it had arrived, saved on 8 September 2026 - and,
// unlike the fixture above, everything the page prints AFTER the timeline: the
// contact buttons, the signature card, the feedback panel, the product list and
// the config script. That tail is the whole point of it. The first fixture
// stops at the end of the timeline, which is exactly why it could not catch the
// last step running away with the rest of the document.
const DELIVERED_PAGE = readFileSync(
  path.join(__dirname, '__fixtures__', 'multidrop-delivered.html'),
  'utf8',
)

describe('parseMultidropStages', () => {
  it('reads the courier\'s seven steps in their own words', () => {
    const stages = parseMultidropStages(REAL_PAGE)
    expect(stages.map((s) => s.label)).toEqual([
      'Order Data Received',
      'Deliverable Products Received at Depot',
      'Date Scheduled',
      'Date Confirmed',
      'Assigned to Crew',
      "You're Up Next",
      'Complete',
    ])
  })

  it('knows which have been reached', () => {
    const stages = parseMultidropStages(REAL_PAGE)
    expect(stages.filter((s) => s.done).map((s) => s.position)).toEqual([1, 2, 3, 4])
    expect(stages.filter((s) => !s.done).map((s) => s.label)).toEqual([
      'Assigned to Crew',
      "You're Up Next",
      'Complete',
    ])
  })

  it('keeps the timestamp where the courier printed one', () => {
    const stages = parseMultidropStages(REAL_PAGE)
    expect(stages[0]?.time).toBe('07/09/2026 13:16')
    expect(stages[4]?.time).toBeNull()
  })

  it('strips the date the scheduled step carries into its own label', () => {
    // The page writes "Date Scheduled - 08 September 2026" as one run of text.
    // That trailing date is not part of the stage's name, and leaving it there
    // would make the stage unmatchable against a setting.
    const stages = parseMultidropStages(REAL_PAGE)
    expect(stages[2]?.label).toBe('Date Scheduled')
  })

  it('stops the last step at its own closing tag, not at the end of the page', () => {
    // The defect this exists for. Step 7 has no step after it to stop at, so it
    // ran to the end of the document and the stage came back as "Complete" plus
    // every card, phone number and script tag that follows it. Nothing matched
    // the courier's delivered setting, so a delivered parcel sat unfinished.
    const stages = parseMultidropStages(DELIVERED_PAGE)
    const last = stages[stages.length - 1]
    expect(last?.label).toBe('Complete')
    expect(last?.done).toBe(true)
    expect(last?.time).toBe('08/09/2026 14:23')
  })

  it('reads a delivered page as the same seven steps', () => {
    expect(parseMultidropStages(DELIVERED_PAGE).map((s) => s.label)).toEqual([
      'Order Data Received',
      'Deliverable Products Received at Depot',
      'Date Scheduled',
      'Date Confirmed',
      'Assigned to Crew',
      "You're Up Next",
      'Complete',
    ])
  })

  it('refuses a stage name too long to be one', () => {
    // Belt and braces for the day their markup changes shape again: a label
    // longer than the settings box allows cannot be a stage anybody configured,
    // so it is dropped rather than stored and matched against.
    const runaway = `<div id="tl-step1" class="timeline-step done">${'x'.repeat(400)}</div>`
    expect(parseMultidropStages(runaway)).toEqual([])
  })

  it('learns nothing from a page that is not one of theirs', () => {
    // Empty must mean "nothing learned", never "not delivered" - the caller
    // leaves the parcel exactly as it was.
    expect(parseMultidropStages('<html><body>Sign in to continue</body></html>')).toEqual([])
    expect(parseMultidropStages('')).toEqual([])
  })
})

describe('furthestStage', () => {
  it('is the last stage reached', () => {
    expect(furthestStage(parseMultidropStages(REAL_PAGE))?.label).toBe('Date Confirmed')
  })

  it('is the courier\'s own word for delivered once it has arrived', () => {
    // 'Complete' exactly, because that is what the shop matches a courier's
    // deliveredStages setting against.
    expect(furthestStage(parseMultidropStages(DELIVERED_PAGE))?.label).toBe('Complete')
  })

  it('reads a gap as progress rather than as going backwards', () => {
    // A courier that ticks a later step while leaving an earlier one blank is
    // reporting progress. Taking the first not-done step would have the parcel
    // moving back up its own timeline.
    const stages = [
      { position: 1, label: 'One', done: true, failed: false, time: null },
      { position: 2, label: 'Two', done: false, failed: false, time: null },
      { position: 3, label: 'Three', done: true, failed: false, time: null },
    ]
    expect(furthestStage(stages)?.label).toBe('Three')
  })

  // Multidrop's page on 25 September 2026, cut down: six steps done, then the
  // failed attempt drawn as step 8 in place of step 7, classed `failed` and not
  // `done`. It was read straight past, and the order sat on "You're Up Next"
  // for the rest of the day.
  const FAILED_PAGE = `
    <div class="timeline">
      <div id="tl-step5" class="timeline-step done">Assigned to Crew
        <div class="tl-time">25/09/2026 06:47</div></div>
      <div id="tl-step6" class="timeline-step done">You're Up Next
        <div class="tl-time">25/09/2026 09:08</div></div>
      <div id="tl-step8" class="timeline-step failed">
        <svg><use href="#icon-truck-alert"/></svg>
        Failed Attempt - Non Fault - RECIPIENT NOT HOME - UNABLE TO DELIVER
        <div class="tl-time">25/09/2026 09:19</div>
      </div>
    </div>`

  it('counts a failed attempt as reached', () => {
    const stages = parseMultidropStages(FAILED_PAGE)
    expect(stages[2]).toMatchObject({ position: 8, done: false, failed: true, time: '25/09/2026 09:19' })
    expect(furthestStage(stages)?.label).toBe('Failed Attempt - Non Fault - RECIPIENT NOT HOME - UNABLE TO DELIVER')
  })

  it('lets a later step overtake a failed attempt', () => {
    // The failure sits at position 8, above everything, so position alone
    // would hold it there after a second visit went fine.
    const stages = [
      { position: 6, label: "You're Up Next", done: true, failed: false, time: '25/09/2026 09:08' },
      { position: 7, label: 'Complete', done: true, failed: false, time: '29/09/2026 11:02' },
      { position: 8, label: 'Failed Attempt', done: false, failed: true, time: '25/09/2026 09:19' },
    ]
    expect(furthestStage(stages)?.label).toBe('Complete')
  })

  it('is nothing when nothing has happened yet', () => {
    expect(furthestStage([{ position: 1, label: 'One', done: false, failed: false, time: null }])).toBeNull()
    expect(furthestStage([])).toBeNull()
  })
})

describe('isMultidropUrl', () => {
  it('picks out the pages this can read', () => {
    expect(isMultidropUrl('https://multidrop.link/30YSO9/E32RS')).toBe(true)
    expect(isMultidropUrl('https://www.multidrop.link/30YSO9/E32RS')).toBe(true)
  })

  it('leaves every other courier alone', () => {
    expect(isMultidropUrl('https://www.royalmail.com/track/AB123')).toBe(false)
    expect(isMultidropUrl('https://multidrop.link.example.com/evil')).toBe(false)
    expect(isMultidropUrl(null)).toBe(false)
    expect(isMultidropUrl('not a url')).toBe(false)
  })
})
