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

export type StageMeaning = 'out-for-delivery' | 'delivered' | 'progress'

/** Trimmed and lower-cased, because these are typed into a settings box by hand
 *  and "Assigned to crew " is the same stage as "Assigned to Crew". */
function normalise(value: string): string {
  return value.trim().toLowerCase()
}

export function stageMeaning(
  courier: Pick<ShpCourier, 'outForDeliveryStages' | 'deliveredStages'> | null,
  stage: string | null | undefined,
): StageMeaning {
  const name = normalise(stage ?? '')
  if (!courier || !name) return 'progress'

  // Delivered wins a stage named in both lists. An owner who has listed the
  // same words twice has made a mistake, and of the two readings "it has
  // arrived" is the one that stops the shop chasing a parcel that is already in
  // somebody's hallway.
  if (courier.deliveredStages.some((s) => normalise(s) === name)) return 'delivered'
  if (courier.outForDeliveryStages.some((s) => normalise(s) === name)) return 'out-for-delivery'
  return 'progress'
}

/** Whether this courier is one the shop reads on a schedule at all. */
export function courierIsPolled(courier: Pick<ShpCourier, 'trackingSource'> | null): boolean {
  return courier?.trackingSource === 'multidrop'
}
