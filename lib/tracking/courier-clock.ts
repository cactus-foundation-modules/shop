// Turning a courier's clock into an instant.
//
// Every carrier feed in this folder prints wall-clock time with no offset:
// GFS "10/9/2026 09:41", DPD "2026-09-10 12:20:00". Those are UK local times
// on a UK carrier's page, and the shop's own reckoning is the site timezone.
//
// `new Date('2026-09-10T12:20:00')` reads that as local to whatever machine is
// running, which on a deployed site is UTC. Store that and render it in
// Europe/London and a delivery signed at 12:20 is shown as 13:20 for the seven
// months of the year Britain is on summer time. That is exactly what happened
// to the first real proof of delivery this module ever recorded, and an hour is
// enough to make a customer sure they were out when the driver called.
//
// So the wall clock is read as belonging to the site's timezone, and the offset
// is asked of the platform for THAT DATE rather than assumed - which is the
// only way to be right on the two days a year the clocks move, and the reason
// this is not simply "add an hour in summer".

/** How far the zone is from UTC at that instant, in minutes. Positive east. */
function offsetMinutes(instant: Date, timezone: string): number {
  // Format the instant in the target zone, read the parts back as though they
  // were UTC, and the difference is the offset. Longwinded, and the only way
  // to get this out of Intl without a date library.
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(instant)

  const get = (type: string): number => Number(parts.find((p) => p.type === type)?.value ?? '0')
  // 24 is midnight in some ICU versions; both readings are the same instant.
  const hour = get('hour') % 24
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), hour, get('minute'), get('second'))
  return Math.round((asUtc - instant.getTime()) / 60000)
}

/**
 * A courier's wall-clock reading, as an instant in the site's timezone.
 *
 * Takes 'YYYY-MM-DDTHH:MM:SS' with no offset - what every reader in this folder
 * produces - and returns null for anything else, because a courier who changes
 * their format should cost us one unreadable timestamp rather than a plausible
 * wrong one.
 *
 * The offset is looked up twice on purpose. The first guess treats the wall
 * clock as UTC, which lands within a day of the truth; the second asks the zone
 * what its offset actually is at that point, which is what settles the hour
 * either side of a clock change. Without the second pass, a delivery scanned at
 * 01:30 on the last Sunday in October comes back an hour out - the one morning
 * of the year when two different instants print the same clock face.
 */
export function courierInstant(wallClock: string | null | undefined, timezone: string): Date | null {
  if (!wallClock) return null
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(wallClock.trim())
  if (!m) return null

  const [, year, month, day, hour, minute, second] = m as unknown as string[]
  const naive = Date.UTC(
    Number(year), Number(month) - 1, Number(day),
    Number(hour), Number(minute), Number(second ?? '0'),
  )
  if (Number.isNaN(naive)) return null

  const firstPass = new Date(naive - offsetMinutes(new Date(naive), timezone) * 60000)
  return new Date(naive - offsetMinutes(firstPass, timezone) * 60000)
}
