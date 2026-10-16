// One recorded parcel that the courier carries as several boxes.
//
// A supplier books one delivery and puts four labels on it: one reference for
// the lot, and a parcel number per box. The courier then treats each box as its
// own parcel - its own scans, its own van, sometimes its own day. Order
// DW000231 went out as four DPD boxes; three were delivered together at 12:06
// and the fourth was held at a hub, while the shop followed one box, saw it
// delivered, and finished the order off.
//
// So a shipment carries the whole list (migration 074), and the rule that
// follows from it is simple: the parcel has arrived when every box has.
//
// Pure, with no imports at all, because the customer's page, the order screen
// and the emails all word the same count from it - and the order screen is a
// client bundle. Reading the list out of the database is
// consignment-parcels-schema.ts.

export type ConsignmentParcel = {
  /** The courier's key for this box - '15505217099684*21473' on DPD. */
  code: string
  /** The number as the courier prints it, '1550 5217 099 684 K'. */
  number: string
  /** The follow-my-parcel code that unlocks this box's full feed and its proof
   *  of delivery, where staff have pasted the link in. Each box has its own,
   *  and one box's code says nothing about its neighbours. */
  shortCode: string | null
  /** What the courier last said about this box, in their words. */
  stage: string | null
  /** Set once and never taken back, the same as the parcel's own delivered_at. */
  delivered: boolean
  /** ISO instant the courier says it was handed over, or when we first saw it. */
  deliveredAt: string | null
  receivedBy: string | null
  /** Our copy of the courier's photograph. Boxes left together share one: the
   *  courier takes a picture per drop, not per box. */
  photoUrl: string | null
  photoKey: string | null
  /** The courier's own key for that photograph, which is how two boxes in the
   *  same drop are known to share one and it is stored once. */
  photoRef: string | null
  /** ISO instant this box was last asked about. */
  checkedAt: string | null
}

/** A box we have just been told about, with nothing known beyond its number. */
export function newConsignmentParcel(code: string, number: string, shortCode: string | null = null): ConsignmentParcel {
  return {
    code,
    number,
    shortCode,
    stage: null,
    delivered: false,
    deliveredAt: null,
    receivedBy: null,
    photoUrl: null,
    photoKey: null,
    photoRef: null,
    checkedAt: null,
  }
}

/** More than one box. A list of one is a delivery that was asked about and
 *  turned out to be the ordinary case. */
export function isSplitConsignment(parcels: readonly ConsignmentParcel[] | null | undefined): parcels is ConsignmentParcel[] {
  return Array.isArray(parcels) && parcels.length > 1
}

export type ConsignmentCount = { total: number; delivered: number; toGo: number }

export function consignmentCount(parcels: readonly Pick<ConsignmentParcel, 'delivered'>[]): ConsignmentCount {
  const delivered = parcels.filter((p) => p.delivered).length
  return { total: parcels.length, delivered, toGo: parcels.length - delivered }
}

/** "3 of 4 delivered, 1 to go" - or the plain count before any have landed,
 *  and "All 4 delivered" once they have. For the customer's page and the
 *  order screen alike. */
export function consignmentProgressLine(parcels: readonly Pick<ConsignmentParcel, 'delivered'>[]): string {
  const { total, delivered, toGo } = consignmentCount(parcels)
  if (delivered === 0) return `Coming in ${total} parcels`
  if (toGo === 0) return `All ${total} parcels delivered`
  return `${delivered} of ${total} parcels delivered, ${toGo} still to come`
}

export type ParcelCountVars = {
  /** How many boxes these shipments are coming in, as a numeral. */
  parcelCount: string
  /** Only once the courier has told us a delivery is split - never guessed
   *  from the number of things ordered. */
  hasSeveralParcels: 'true' | 'false'
}

/**
 * The count for an email. Several recorded parcels on one order are already
 * worded by the dispatch templates themselves; this is about one of them
 * turning out to be several boxes, which only the courier can say. A shipment
 * the courier has not been asked about counts as one.
 */
export function parcelCountVars(
  shipments: ReadonlyArray<{ consignmentParcels?: readonly ConsignmentParcel[] | null }>,
): ParcelCountVars {
  const split = shipments.some((s) => isSplitConsignment(s.consignmentParcels as ConsignmentParcel[] | null | undefined))
  const total = shipments.reduce((sum, s) => sum + Math.max(1, s.consignmentParcels?.length ?? 0), 0)
  return {
    parcelCount: String(total),
    hasSeveralParcels: split ? 'true' : 'false',
  }
}

/** Several boxes, and at least one still to come. Whatever else the parcel
 *  carries - a delivered time, a name, a photograph from an earlier drop - it
 *  has not arrived while this is true. */
export function boxesStillToCome(parcels: readonly ConsignmentParcel[] | null | undefined): boolean {
  return isSplitConsignment(parcels as ConsignmentParcel[] | null | undefined)
    && (parcels as ConsignmentParcel[]).some((p) => !p.delivered)
}
