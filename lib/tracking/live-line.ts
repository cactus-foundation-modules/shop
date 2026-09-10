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
  /** 'Mozam is on drop 9 of 98.', or '' where the courier has not said. */
  round: string
  /** 'You are drop 34, about an hour and a half away.', or ''. */
  yours: string
  /** How far through the round they are, 0-1, for a bar. Null where the numbers
   *  do not support one - and never faked from the estimate, which would draw a
   *  bar that disagreed with the sentence beside it. */
  fraction: number | null
}

/**
 * The live progress of one delivery, in words a person would use.
 *
 * Everything is optional and every part is dropped rather than guessed. A
 * courier that gives a driver's name and nothing else says "Mozam is out with
 * it"; one that gives numbers and no name says "the driver". Nothing here ever
 * says "you are next" - that is a claim about the van, and the only honest
 * version of it is the courier's own count.
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
  const { stopNumber, stopsCompleted, stopsTotal } = input

  const round = stopsCompleted !== null && stopsTotal !== null && stopsTotal > 0
    ? `${driver} is on drop ${stopsCompleted} of ${stopsTotal}.`
    : ''

  const remaining = input.minutesToStop === null
    ? null
    : Math.max(0, input.minutesToStop - minutesSince(input.checkedAt, input.now))

  const parts: string[] = []
  if (stopNumber !== null) parts.push(`You are drop ${stopNumber}`)
  // The estimate on its own is still worth saying, and reads differently
  // depending on whether a drop number came with it.
  if (remaining !== null) {
    parts.push(parts.length > 0 ? spokenMinutes(remaining) : `Your parcel is ${spokenMinutes(remaining)}`)
  }
  const yours = parts.length > 0 ? `${parts.join(', ')}.` : ''

  const fraction = stopsCompleted !== null && stopsTotal !== null && stopsTotal > 0
    ? Math.min(1, Math.max(0, stopsCompleted / stopsTotal))
    : null

  return { round, yours, fraction }
}
