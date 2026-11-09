// What each tracking source tells the shop for itself, and the stage words it
// is KNOWN to use - for the Couriers screen, which suggests them and warns when
// a list that matters has been left empty.
//
// `reportsItself` has to agree with the readers, not with hope: AIT's reader
// turns status codes into all three meanings (ait-stages.ts); Fieldly's and
// DPD's feeds say delivered outright, and DPD's says out for delivery too
// (reading.delivered / reading.outForDelivery, which store-reading.ts prefers
// to the owner's lists). Everyone else reports words, and only the owner's
// lists give those words a meaning.
//
// `known` is deliberately short. A word goes in only once a real parcel has
// shown it - an owner who clicks a suggestion is trusting it to match, and a
// guessed word that never matches is worse than no suggestion, because it
// looks configured. Where nobody has seen the word yet, there is no entry and
// the screen suggests nothing.
//
// No imports, so the client screen can use it without the readers.

export type StageListKey = 'outForDeliveryStages' | 'deliveredStages' | 'failedStages'
export type PolledSource = 'multidrop' | 'gfs' | 'dpd' | 'ait' | 'fieldly' | 'palletways'

type SourceStages = {
  reportsItself: Record<StageListKey, boolean>
  known: Partial<Record<StageListKey, readonly string[]>>
}

const NONE = { outForDeliveryStages: false, deliveredStages: false, failedStages: false }

export const SOURCE_STAGES: Readonly<Record<PolledSource, SourceStages>> = {
  // The seven-step timeline on multidrop.link; seen on Furdeco parcels,
  // September 2026 (fixtures/multidrop-timeline.html, and a failed attempt).
  multidrop: {
    reportsItself: NONE,
    known: {
      outForDeliveryStages: ['Assigned to Crew', "You're Up Next"],
      deliveredStages: ['Complete'],
      failedStages: ['Failed Attempt'],
    },
  },
  // Raw carrier scans; "OUT FOR DELIVERY, ETA: ..." seen 10 September 2026.
  gfs: {
    reportsItself: NONE,
    known: { outForDeliveryStages: ['OUT FOR DELIVERY'] },
  },
  dpd: {
    reportsItself: { outForDeliveryStages: true, deliveredStages: true, failedStages: false },
    known: {},
  },
  ait: {
    reportsItself: { outForDeliveryStages: true, deliveredStages: true, failedStages: true },
    known: {},
  },
  fieldly: {
    reportsItself: { outForDeliveryStages: false, deliveredStages: true, failedStages: false },
    known: {},
  },
  // Their status column, in capitals; both seen on real pallets, October 2026.
  palletways: {
    reportsItself: NONE,
    known: {
      outForDeliveryStages: ['OUT FOR DELIVERY'],
      deliveredStages: ['JOB COMPLETE'],
    },
  },
}

export function sourceStages(source: string): SourceStages | null {
  return Object.hasOwn(SOURCE_STAGES, source) ? SOURCE_STAGES[source as PolledSource] : null
}

/** The lists a followed courier leaves empty that nothing else fills in - each
 *  one a thing the shop will silently never do for that courier's parcels. */
export function missingStageLists(courier: { trackingSource: string } & Record<StageListKey, string[]>): StageListKey[] {
  const stages = sourceStages(courier.trackingSource)
  if (!stages) return []
  return (['deliveredStages', 'outForDeliveryStages', 'failedStages'] as const)
    .filter((key) => !stages.reportsItself[key] && courier[key].length === 0)
}
