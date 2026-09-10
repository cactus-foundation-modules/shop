// What one look at a courier's tracking gives back, whichever courier it was.
//
// Every reader in this folder answers in these terms, and the poller writes
// them down without knowing which one it asked. That boundary is the whole
// design: Multidrop reports a stage off a seven-step timeline, DPD reports a
// sentence and a stop number, GFS reports raw depot scans, and none of them
// should teach the poller anything about themselves.
//
// Everything is nullable because every field is something SOME courier does not
// have. A reader must never invent one to look complete - a missing window is a
// window we do not know, and a customer told "between 11:41 and 12:41" on a
// guess is worse off than one told nothing.

import { z } from 'zod'

/** One line of a courier's history, in the courier's own words. */
export type TrackingEvent = {
  /** 'YYYY-MM-DDTHH:MM:SS', in the courier's own reckoning and NOT converted.
   *  Their feeds carry no offset, and inventing one here would move a scan an
   *  hour either way twice a year. The site's timezone is applied when it is
   *  rendered, which is the only place that knows the reader. */
  at: string
  /** 'PRESTON', 'HUB 5 - HINCKLEY', or '' where the courier gives none. */
  location: string
  /** 'OUT FOR DELIVERY, ETA: 11:41 - 12:41'. Never rewritten on the way in. */
  text: string
}

export type TrackingReading = {
  /** The stage in the courier's own words, which the shop's own settings turn
   *  into out-for-delivery or delivered. Null means the page loaded and said
   *  nothing this reader recognised, which is not the same as "not moved". */
  stage: string | null
  /** Newest first, as every courier's own page shows it. */
  events: TrackingEvent[]
  /** The window the van is working to TODAY, as instants. Distinct from the
   *  booked slot on the shipment: that is what the shop was promised, this is
   *  what is actually happening. */
  windowFrom: Date | null
  windowTo: Date | null
  /** This parcel's place on the round, and how far along the driver is. */
  stopNumber: number | null
  stopsCompleted: number | null
  stopsTotal: number | null
  /** The courier's own estimate in minutes. Kept as minutes because it decays:
   *  turning it into a clock time here would freeze it at the moment it was
   *  read, and it is read on a schedule. */
  minutesToStop: number | null
  /** The driver's first name, as the courier prints it. */
  driverName: string | null
}

export const EMPTY_READING: TrackingReading = {
  stage: null,
  events: [],
  windowFrom: null,
  windowTo: null,
  stopNumber: null,
  stopsCompleted: null,
  stopsTotal: null,
  minutesToStop: null,
  driverName: null,
}

/**
 * The history as it comes back OUT of the database.
 *
 * jsonb is checked rather than cast on the way out, not because this build
 * writes anything else, but because a column is forever: a row written by a
 * later build, an older one, or a restored backup is data of unknown shape, and
 * a cast would hand it to a page as though it were a history. A row that does
 * not parse reads as no history, which is exactly what a parcel that never had
 * one renders.
 */
export const trackingEventsSchema = z.array(z.object({
  at: z.string(),
  location: z.string(),
  text: z.string(),
}))
