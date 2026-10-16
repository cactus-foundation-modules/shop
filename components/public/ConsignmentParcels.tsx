import { consignmentProgressLine, type ConsignmentParcel } from '@/modules/shop/lib/consignment-parcels'
import { formatOrderDateTime } from '@/modules/shop/lib/order-display'

// "3 of 4 parcels delivered, 1 still to come", on the customer's own page.
//
// The courier carries this delivery as several boxes and may bring them on
// different days. Without this, a customer whose first three boxes arrived
// would read "delivered" on the parcel and wonder where the fourth had gone -
// or, worse, be told nothing was coming at all. So each box gets a line of its
// own, and each drop its own photograph, once the courier has taken one.
//
// Server-rendered, as the rest of the tracking card is.

export function ConsignmentParcels({ parcels, timezone }: { parcels: ConsignmentParcel[]; timezone: string }) {
  // Boxes left together share one photograph; it is shown once, under the
  // last of them.
  const photoShownBy = new Map<string, string>()
  for (const box of parcels) {
    if (box.photoUrl) photoShownBy.set(box.photoUrl, box.code)
  }

  return (
    <div className="sod-boxes">
      <p className="sod-boxes-head">{consignmentProgressLine(parcels)}</p>
      <ol className="sod-boxes-list">
        {parcels.map((box, index) => {
          const at = box.deliveredAt ? new Date(box.deliveredAt) : null
          const when = at && !Number.isNaN(at.getTime()) ? ` ${formatOrderDateTime(at, timezone)}` : ''
          return (
            <li key={box.code} className={box.delivered ? 'is-delivered' : undefined}>
              <span className="sod-boxes-name">Parcel {index + 1}</span>
              <span className="sod-boxes-state">
                {box.delivered
                  ? `Delivered${when}${box.receivedBy ? `, received by ${box.receivedBy}` : ''}`
                  : box.stage ?? 'On its way'}
              </span>
              {box.photoUrl && photoShownBy.get(box.photoUrl) === box.code && (
                // eslint-disable-next-line @next/next/no-img-element -- proof of delivery is an arbitrary third-party image of unknown dimensions.
                <img
                  className="sod-signed-img"
                  src={box.photoUrl}
                  alt={`Where parcel ${index + 1} was left`}
                  loading="lazy"
                />
              )}
            </li>
          )
        })}
      </ol>
    </div>
  )
}
