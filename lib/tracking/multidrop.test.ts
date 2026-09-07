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

  it('reads a gap as progress rather than as going backwards', () => {
    // A courier that ticks a later step while leaving an earlier one blank is
    // reporting progress. Taking the first not-done step would have the parcel
    // moving back up its own timeline.
    const stages = [
      { position: 1, label: 'One', done: true, time: null },
      { position: 2, label: 'Two', done: false, time: null },
      { position: 3, label: 'Three', done: true, time: null },
    ]
    expect(furthestStage(stages)?.label).toBe('Three')
  })

  it('is nothing when nothing has happened yet', () => {
    expect(furthestStage([{ position: 1, label: 'One', done: false, time: null }])).toBeNull()
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
