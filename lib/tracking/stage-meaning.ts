import type { ShpCourier } from '@/modules/shop/lib/courier-faqs'

// What one of a courier's stages MEANS, according to the shop's settings.
//
// Kept apart from the parser on purpose. The parser reports the courier's own
// words; this decides whether those words are worth acting on. The two change
// for different reasons and at different speeds - the markup changes when the
// carrier rebuilds their site, the meanings change the first afternoon somebody
// watches a real delivery go through and sees which stage the van actually left
// on.
//
// Nothing is inferred from a stage's position or its wording. "Complete" is
// only the end because a setting says so; a courier whose last stage is
// "Signed For" is configured, not special-cased.

export type StageMeaning = 'out-for-delivery' | 'delivered' | 'failed' | 'progress'

/** Trimmed and lower-cased, because these are typed into a settings box by hand
 *  and "Assigned to crew " is the same stage as "Assigned to Crew". */
function normalise(value: string): string {
  return value.trim().toLowerCase()
}

/**
 * A carrier's stage, cut into the parts an owner could actually have typed.
 *
 * Multidrop's stages are tidy names - "Assigned to Crew" - and match whole. A
 * carrier scan does not: GFS report "OUT FOR DELIVERY, ETA: 11:41 - 12:41" and
 * DPD "Delivered, signed for by MOTHER". The times are different on every
 * parcel, so an exact match against a settings box could never once succeed,
 * and an owner would sit there typing stages that never took.
 *
 * Split on the punctuation carriers use to staple that detail on, and each
 * piece is compared whole. Deliberately NOT a substring test: "delivered"
 * appears inside "not delivered" and "attempted delivery", and a shop whose
 * orders completed themselves on a failed delivery would be worse off than one
 * with no automation at all.
 */
function segments(stage: string): string[] {
  return normalise(stage)
    .split(/[,;.]|\s+-\s+/)
    .map((part) => part.trim())
    .filter(Boolean)
}

/** The part of a stage before a courier staples a timeslot on. DPD's
 *  out-for-delivery line is the same opening on every parcel with only the
 *  window changing, so a setting copied from one example still has to match
 *  the rest. */
function beforeWindow(value: string): string {
  return normalise(value).split(/\bbetween\b/)[0]?.trim() ?? normalise(value)
}

/** Whether one of the owner's phrases names this stage. The whole stage counts
 *  as a segment, so a courier with tidy names behaves exactly as it did before
 *  any of this existed. */
function named(list: string[], stage: string): boolean {
  const parts = new Set([normalise(stage), ...segments(stage)])
  const stageOpening = beforeWindow(stage)
  return list.some((entry) => {
    const entryNorm = normalise(entry)
    if (parts.has(entryNorm)) return true
    const entryOpening = beforeWindow(entry)
    return entryOpening.length > 12 && entryOpening === stageOpening
  })
}

export function stageMeaning(
  courier: Pick<ShpCourier, 'outForDeliveryStages' | 'deliveredStages' | 'failedStages'> | null,
  stage: string | null | undefined,
): StageMeaning {
  const name = normalise(stage ?? '')
  if (!courier || !name) return 'progress'

  // Delivered wins a stage named in both lists. An owner who has listed the
  // same words twice has made a mistake, and of the two readings "it has
  // arrived" is the one that stops the shop chasing a parcel that is already in
  // somebody's hallway.
  if (named(courier.deliveredStages, name)) return 'delivered'
  // Failed beats out for delivery for the same reason: a van that has been and
  // gone again is not on its way, and saying it is has somebody waiting in for
  // a delivery that has already not happened.
  if (named(courier.failedStages, name)) return 'failed'
  if (named(courier.outForDeliveryStages, name)) return 'out-for-delivery'
  return 'progress'
}

/**
 * The courier's reason for a failed attempt, in words fit for the customer, or
 * '' when the stage says nothing past "it failed".
 *
 * Multidrop staples the reason onto the stage itself: "Failed Attempt - Non
 * Fault - RECIPIENT NOT HOME - UNABLE TO DELIVER". The part the owner listed as
 * the failed stage is dropped (the customer already knows it failed), so is
 * "Non Fault" (depot bookkeeping, not news), and a reason shouted in capitals is
 * brought down to a sentence: "Recipient not home - unable to deliver".
 * Only cut on " - ", so a comma inside a reason survives.
 */
export function failedReason(
  courier: Pick<ShpCourier, 'failedStages'> | null,
  stage: string | null | undefined,
): string {
  if (!courier || !stage?.trim()) return ''
  const listed = new Set(courier.failedStages.map(normalise))
  // The owner listed the whole stage: it is the failure, not a reason for one.
  if (listed.has(normalise(stage))) return ''
  const parts = stage
    .split(/\s+-\s+/)
    .map((part) => part.trim())
    .filter((part) => part && !listed.has(normalise(part)) && !/^non[\s-]?fault$/i.test(part))
  if (parts.length === 0) return ''
  const reason = parts.join(' - ')
  if (reason !== reason.toUpperCase()) return reason
  const lower = reason.toLowerCase()
  return lower.charAt(0).toUpperCase() + lower.slice(1)
}

/** Whether this courier is one the shop reads on a schedule at all.
 *
 *  Asked as "not none" rather than by listing the sources, so adding a reader
 *  never means remembering to add it here too - the failure that would cause is
 *  silent, and looks exactly like a courier whose website is down. */
export function courierIsPolled(courier: Pick<ShpCourier, 'trackingSource'> | null): boolean {
  return Boolean(courier) && courier?.trackingSource !== 'none'
}
