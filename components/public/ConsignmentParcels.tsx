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

/** "1", "1 and 2", "1, 2 and 3". */
function listNumbers(numbers: number[]): string {
  if (numbers.length < 2) return numbers.join('')
  return `${numbers.slice(0, -1).join(', ')} and ${numbers[numbers.length - 1]}`
}

export function ConsignmentParcels({ parcels, timezone }: { parcels: ConsignmentParcel[]; timezone: string }) {
  // Boxes left together share one photograph - the courier takes one per
  // drop, not per box. So each photograph is shown once, under the list, and
  // says which parcels are in it; hung off one box it read as that box's alone.
  const drops: Array<{ url: string; numbers: number[] }> = []
  parcels.forEach((box, index) => {
    if (!box.photoUrl) return
    const drop = drops.find((d) => d.url === box.photoUrl)
    if (drop) drop.numbers.push(index + 1)
    else drops.push({ url: box.photoUrl, numbers: [index + 1] })
  })

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
            </li>
          )
        })}
      </ol>
      {drops.map((drop) => (
        <figure key={drop.url} className="sod-boxes-photo">
          {/* eslint-disable-next-line @next/next/no-img-element -- proof of delivery is an arbitrary third-party image of unknown dimensions. */}
          <img
            className="sod-signed-img"
            src={drop.url}
            alt={`Where ${drop.numbers.length > 1 ? 'parcels' : 'parcel'} ${listNumbers(drop.numbers)} ${drop.numbers.length > 1 ? 'were' : 'was'} left`}
            loading="lazy"
          />
          <figcaption className="sod-boxes-state">
            {drop.numbers.length > 1
              ? `Parcels ${listNumbers(drop.numbers)} were delivered together - this photo covers all ${drop.numbers.length}.`
              : `Parcel ${drop.numbers[0]}.`}
          </figcaption>
        </figure>
      ))}
    </div>
  )
}
