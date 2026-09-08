// Reading a Multidrop tracking page.
//
// Multidrop (GSIT/Senteca) is what several furniture carriers put behind their
// "track your order" link. Its page is plain server-rendered HTML - no script
// has to run to see the answer - and its timeline is seven fixed steps, each a
// div with a stable id, the stage's name as text, an optional timestamp, and a
// `done` class once it has been reached:
//
//   <div id="tl-step5" class="timeline-step ">
//     <svg><use href="#icon-van"/></svg>
//     Assigned to Crew
//   </div>
//
// WHY THIS PARSES RATHER THAN GUESSES
//
// The stage names are read off the page and kept in the courier's own words.
// What each one MEANS - out for delivery, delivered - is a setting, because it
// is the part we are least sure of: whether "Assigned to Crew" means a van is
// out today or merely that tomorrow's round has been planned is a question for
// the carrier, and the answer must not need a release. So this file reports
// what the page says and nothing more.
//
// It is deliberately a small, tolerant parser and not a DOM library. The whole
// job is "which of these seven lines has a class on it", the page is one we do
// not control, and pulling a parser into a scheduled route to answer that would
// be a dependency and a memory footprint for no gain. Anything it cannot make
// sense of comes back as no stages, which the caller treats as "nothing learned
// this time" rather than as an answer.

import { textOf } from '@/modules/shop/lib/tracking/html-text'

export type TrackingStage = {
  /** 1-based position in the courier's own timeline. */
  position: number
  /** The stage's own words: 'Assigned to Crew'. */
  label: string
  /** Whether the parcel has reached it. */
  done: boolean
  /** The timestamp printed under it, verbatim, where there is one. Kept as the
   *  courier's own text - it is shown to nobody and parsed by nothing, and
   *  their format is theirs to change. */
  time: string | null
}

// Each step's own chunk of markup, found by counting divs in and out from its
// opening tag.
//
// Neither shortcut works here. Stopping at the first `</div>` swallows the
// timestamp into the stage's name, because a step CONTAINS a div. Stopping at
// the NEXT step - the way this once did - has no next step to stop at on the
// last one, so step 7 ran to the end of the document: on 8 September 2026 a
// delivered parcel's stage was recorded as "Complete" followed by the contact
// buttons, the signature card, the feedback panel and the page's own config
// script, which matched no setting, so the order was never completed. Counting
// depth is the only reading that is right at both ends.
const STEP_SPLIT = /<div\s+id="tl-step(\d+)"/i
const STEP_SPLIT_ALL = /<div\s+id="tl-step(\d+)"/gi
const CLASS_PATTERN = /class="([^"]*)"/i
const TIME_PATTERN = /<div\s+class="tl-time"[^>]*>([\s\S]*?)<\/div>/i
const DIV_TAG = /<div\b|<\/div\s*>/gi

// Longest a stage's name may be and still be a stage. The settings box these
// are matched against caps a stage at 120 characters, so anything past that is
// not something an owner could have configured, whatever it is. Belt to the
// depth count's braces: a future redesign that defeats the counting produces no
// stage at all rather than a page dump in a field the shop makes decisions on.
const MAX_LABEL_LENGTH = 120

/**
 * Where the element opening at `start` closes, or null if the markup never
 * closes it. The index of its final `</div>`, so a slice to it holds the whole
 * element and nothing after it.
 */
function elementEnd(html: string, start: number): number | null {
  const openTagEnd = html.indexOf('>', start)
  if (openTagEnd === -1) return null

  DIV_TAG.lastIndex = openTagEnd + 1
  let depth = 1
  let match: RegExpExecArray | null
  while ((match = DIV_TAG.exec(html)) !== null) {
    // '<div' or '</div>' - the second character is the only one that differs.
    if (match[0][1] === '/') {
      depth -= 1
      if (depth === 0) return match.index
    } else {
      depth += 1
    }
  }
  return null
}

/**
 * Every stage on the page, in the courier's order.
 *
 * Empty for anything that is not one of these pages - a login screen, an error,
 * a redirect to a marketing site, a courier who has quietly replaced the whole
 * thing. Empty means "learned nothing", never "not delivered".
 */
export function parseMultidropStages(html: string): TrackingStage[] {
  const starts = [...html.matchAll(STEP_SPLIT_ALL)].map((m) => m.index ?? -1).filter((i) => i >= 0)
  const stages: TrackingStage[] = []

  for (let i = 0; i < starts.length; i++) {
    const start = starts[i] as number
    // The element's own end where the markup is well formed. Where it is not,
    // the next step is a safe bound and the last step has none - a step whose
    // extent cannot be established is skipped rather than guessed at.
    const end = elementEnd(html, start) ?? starts[i + 1]
    if (end === undefined) continue

    const chunk = html.slice(start, end)
    const position = Number(chunk.match(STEP_SPLIT)?.[1])
    if (!Number.isFinite(position)) continue

    // Only the opening tag's own class, which is the first one in the chunk -
    // the timestamp div inside carries a class of its own.
    const classes = chunk.slice(0, chunk.indexOf('>') + 1).match(CLASS_PATTERN)?.[1] ?? ''
    const time = textOf(chunk.match(TIME_PATTERN)?.[1] ?? '')

    // The name, with the timestamp block taken out first so it cannot end up
    // inside it, and with the trailing "- 08 September 2026" that the scheduled
    // step carries stripped: that is a date, not part of the stage's name, and
    // leaving it there would make the stage unmatchable against a setting.
    const label = textOf(chunk.replace(TIME_PATTERN, ' '))
      .replace(/\s*-\s*\d{1,2}\s+\w+\s+\d{4}\s*$/, '')
      .trim()
    if (!label || label.length > MAX_LABEL_LENGTH) continue

    stages.push({
      position,
      label,
      done: /(^|\s)done(\s|$)/.test(classes),
      time: time || null,
    })
  }
  return stages.sort((a, b) => a.position - b.position)
}

/**
 * The furthest stage the parcel has actually reached.
 *
 * The LAST done stage rather than the first not-done one: a courier that ticks
 * a later step while leaving an earlier one blank is reporting progress, and
 * reading it the other way would have the parcel going backwards.
 */
export function furthestStage(stages: TrackingStage[]): TrackingStage | null {
  const done = stages.filter((s) => s.done)
  return done.length > 0 ? (done[done.length - 1] as TrackingStage) : null
}

/** Whether a tracking link is one of these pages, so a shop with three
 *  couriers only ever fetches the ones this can read. */
export function isMultidropUrl(url: string | null | undefined): boolean {
  if (!url) return false
  try {
    return new URL(url).hostname.toLowerCase().endsWith('multidrop.link')
  } catch {
    return false
  }
}
