// How fresh a van position is, and how often to ask for the next one.
//
// Pure, and apart from everything that fetches, because these two answers are
// the ones a customer actually reads. A map with a van on it says "here"; only
// the freshness line says whether "here" was a minute ago or at breakfast, and
// a van drawn confidently on top of an hour-old fix is the site telling a
// polite lie about somebody's sofa.
//
// The thresholds are the courier's own. Their page greys its update line at
// five minutes, so ours calls a fix stale at the same point: two screens
// describing the same van should not disagree about whether to trust it.

export type PositionFreshness = {
  /** 'Updated 1 minute ago'. Ready to print. */
  text: string
  /** Old enough that the van has probably moved since. The line is toned down
   *  rather than hidden - a stale position with an honest label still tells
   *  somebody the crew was two streets away ten minutes ago. */
  stale: boolean
}

const SECOND = 1000
const MINUTE = 60 * SECOND
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/** Where the courier's own page stops trusting a fix. */
const STALE_AFTER_MS = 5 * MINUTE

/** While the crew is still several drops away. Often enough to watch, rare
 *  enough that a page left open all morning is not a denial of service against
 *  a courier who never agreed to any of this. */
export const SLOW_POLL_MS = 5 * MINUTE

/** Once we are next. The van is minutes away and a five-minute tick would show
 *  it arriving after it had knocked. */
export const FAST_POLL_MS = MINUTE

/** How many drops left counts as next. Zero and one both mean "get to the
 *  door" - one more drop is one street. */
export const FAST_POLL_DROPS = 1

/** Longest a page keeps asking. Theirs stops after thirty ticks and asks for a
 *  refresh; ours stops after an hour, for the same reason - a tab forgotten on
 *  a kitchen worktop should not still be polling a courier at teatime. */
export const MAX_LIVE_SESSION_MS = HOUR

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`
}

/**
 * How long ago the VAN reported, worded for a customer.
 *
 * Deliberately fed the courier's fix time and not our poll time. They are
 * different clocks and only one of them answers "has it moved": a fix from five
 * minutes ago that we re-read a second ago is a van sitting still, and saying
 * "updated 1 second ago" there would be true of us and useless to them.
 */
export function positionFreshness(fixedAt: Date | null | undefined, now: Date): PositionFreshness | null {
  if (!fixedAt) return null
  const age = now.getTime() - fixedAt.getTime()
  // A fix from the future is a clock disagreement, not a fresher fix. Treated
  // as "just now" rather than shown as a negative age.
  if (age < 0) return { text: 'Updated just now', stale: false }

  if (age < MINUTE) return { text: `Updated ${plural(Math.floor(age / SECOND), 'second')} ago`, stale: false }
  if (age < HOUR) {
    const minutes = Math.floor(age / MINUTE)
    return { text: `Updated ${plural(minutes, 'minute')} ago`, stale: age >= STALE_AFTER_MS }
  }
  if (age < DAY) return { text: `Updated ${plural(Math.floor(age / HOUR), 'hour')} ago`, stale: true }
  return { text: 'Updated over a day ago', stale: true }
}

/**
 * How long to wait before asking again.
 *
 * Drops away comes from the courier's own sentence, and is null whenever that
 * sentence could not be read. Null takes the slow tick: an unreadable sentence
 * is not evidence that the van is close, and guessing the other way would
 * speed every parcel up for ever the day they reword it.
 */
export function livePollIntervalMs(dropsAway: number | null | undefined): number {
  return typeof dropsAway === 'number' && dropsAway <= FAST_POLL_DROPS ? FAST_POLL_MS : SLOW_POLL_MS
}

/** How long a parcel's last look at the courier stays good enough for somebody
 *  opening the order page. Past it, opening the page asks again; inside it, a
 *  reload shows what was learned a moment ago rather than asking the courier
 *  the same question twice. The same five minutes the map's slow tick uses. */
export const VIEW_CHECK_MIN_AGE_MINUTES = 5
