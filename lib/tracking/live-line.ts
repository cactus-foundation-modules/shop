// "Mozam is on drop 9 of 98. You are drop 34, about an hour and a half away."
//
// What a customer gets instead of a map. Couriers who show a van on a map are
// showing the same three numbers with more pixels, and the numbers are the part
// worth having: a dot moving around Preston does not tell somebody whether to
// put the kettle on, and "nine drops done, you are thirty-fourth" does.
//
// THE ESTIMATE DECAYS, WHICH IS THE WHOLE DIFFICULTY
//
// The courier's estimate was true when it was READ, and it is read on a
// schedule - once an hour on a quiet day. Printing it as it was stored would
// tell somebody at half past twelve that their parcel was ninety minutes away
// at eleven. So the minutes elapsed since the read are taken off, and once
// there is nothing left it stops claiming anything rather than counting into
// the negative.

/** How long ago the courier's estimate was read, in whole minutes. */
function minutesSince(checkedAt: Date | null, now: Date): number {
  if (!checkedAt) return 0
  return Math.max(0, Math.floor((now.getTime() - checkedAt.getTime()) / 60000))
}

/**
 * Minutes as somebody would say them.
 *
 * Deliberately vague at the top end and deliberately not vague at the bottom:
 * "about 4 hours" is honest about a number that came off a route plan, while
 * somebody who is eight minutes away is worth being precise about, because that
 * is the difference between catching the door and missing it.
 */
export function spokenMinutes(minutes: number): string {
  if (minutes <= 2) return 'any minute now'
  if (minutes < 60) return `about ${minutes} minutes away`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  const half = rest >= 20 && rest <= 40
  const unit = hours === 1 ? 'hour' : 'hours'
  if (half) return hours === 1 ? 'about an hour and a half away' : `about ${hours} and a half hours away`
  if (rest > 40) return `about ${hours + 1} ${hours + 1 === 1 ? 'hour' : 'hours'} away`
  return `about ${hours === 1 ? 'an hour' : `${hours} ${unit}`} away`
}

export type LiveProgress = {
  /** 'Mozam has 2 more drops to make before yours.', or '' where the courier
   *  has not said enough to work it out. */
  round: string
  /** 'About 15 minutes away.', or ''. */
  yours: string
  /** How close the driver is to THIS parcel, 0-1, for a bar.
   *
   *  Measured against your own drop, not against the driver's day. Drawn the
   *  other way it is honest arithmetic and a useless picture: 32 of 98 shows a
   *  third of a bar while the van is two streets away, which reads as "not for
   *  hours" to the one person the bar is for. Null where the numbers do not
   *  support one, and never faked from the estimate. */
  fraction: number | null
}

/** How many drops the driver still has before this one, or null. Negative
 *  never happens in their data but is floored anyway: a courier who has passed
 *  your stop without delivering is a question for somebody, not a bar drawn
 *  backwards. */
function dropsAway(stopNumber: number | null, stopsCompleted: number | null): number | null {
  if (stopNumber === null || stopsCompleted === null) return null
  return Math.max(0, stopNumber - stopsCompleted)
}

/**
 * The live progress of one delivery, in words a person would use.
 *
 * Everything is optional and every part is dropped rather than guessed. A
 * courier that gives numbers and no name says "your driver". Nothing here ever
 * says "you are next" off its own bat - that is a claim about the van, and the
 * only honest version of it is the courier's own count reaching yours.
 */
export function liveProgress(input: {
  driverName: string | null
  stopNumber: number | null
  stopsCompleted: number | null
  stopsTotal: number | null
  minutesToStop: number | null
  checkedAt: Date | null
  now: Date
}): LiveProgress {
  const driver = input.driverName?.trim() || 'Your driver'
  const away = dropsAway(input.stopNumber, input.stopsCompleted)

  // What somebody actually wants to know: how many doors before mine. The
  // driver's total round is not mentioned at all - it only ever made a near
  // delivery sound far off.
  const round = away === null
    ? ''
    : away === 0
      ? `${driver} is on their way to you now.`
      : away === 1
        ? `${driver} has one more drop to make before yours.`
        : `${driver} has ${away} more drops to make before yours.`

  const remaining = input.minutesToStop === null
    ? null
    : Math.max(0, input.minutesToStop - minutesSince(input.checkedAt, input.now))

  const spoken = remaining === null ? '' : spokenMinutes(remaining)
  const yours = spoken
    ? `${spoken.charAt(0).toUpperCase()}${spoken.slice(1)}.`
    : ''

  // Against your own drop, so the bar fills as the van approaches YOU. A round
  // with your stop first is full from the start, which is correct.
  const fraction = away !== null && input.stopNumber !== null && input.stopNumber > 0
    ? Math.min(1, Math.max(0, (input.stopsCompleted as number) / input.stopNumber))
    : null

  return { round, yours, fraction }
}
