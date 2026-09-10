import type { ParcelDelivery } from '@/modules/shop/lib/order-delivery'

// What the courier told us about one parcel, on the customer's own page.
//
// The point of the whole tracking feature is here: a customer should not have
// to visit a courier's website to find out where their chair is. So this shows
// the driver's progress in words, the window the van is working to today, and
// the courier's own history - and the button out to the courier is then
// labelled for the things only THEY can do, which on most carriers is a safe
// place, a neighbour, or moving the delivery to another day.
//
// Server-rendered, deliberately. Nothing here ticks: the estimate is worded
// once, from the moment the page was built, and a page that quietly counted
// down would be inventing precision the courier never gave us. Somebody
// refreshing gets a fresher answer, which is the honest interaction.

function formatEventTime(at: string): string {
  // The reader stored 'YYYY-MM-DDTHH:MM:SS' in the courier's own reckoning and
  // did not convert it - see lib/tracking/reading.ts. It is printed the same
  // way, by cutting the string up rather than by making a Date of it: turning
  // it into an instant here would apply the SERVER's idea of a timezone to a
  // timestamp that never had one, and move every scan an hour twice a year.
  const [date, time] = at.split('T')
  if (!date || !time) return at
  const [year, month, day] = date.split('-')
  if (!year || !month || !day) return at
  return `${Number(day)}/${Number(month)} ${time.slice(0, 5)}`
}

export function ParcelTracking({ delivery }: { delivery: ParcelDelivery }) {
  const { live, events } = delivery
  const hasLive = Boolean(live.round || live.yours)
  if (!hasLive && events.length === 0) return null

  return (
    <div className="sod-tracking">
      {hasLive && (
        <div className="sod-live">
          {live.round && <p className="sod-live-round">{live.round}</p>}
          {live.yours && <p className="sod-live-yours">{live.yours}</p>}
          {/* How far through the round the driver is. Drawn only from the two
              numbers the courier gave, never from the estimate - a bar that
              disagreed with the sentence above it would make both look made up.
              aria-hidden because the sentence already says it, and a screen
              reader announcing "9 percent" adds nothing to "on drop 9 of 98". */}
          {live.fraction !== null && (
            <div className="sod-live-bar" aria-hidden="true">
              <span style={{ width: `${Math.round(live.fraction * 100)}%` }} />
            </div>
          )}
        </div>
      )}

      {events.length > 0 && (
        // Closed by default: somebody who wants to know where their parcel is
        // has been told at the top of this card, and the history is for the one
        // person in twenty who wants to see the depots.
        <details className="sod-history">
          <summary>Where it has been</summary>
          <ol className="sod-history-list">
            {events.map((event) => (
              <li key={`${event.at}-${event.text}`}>
                <span className="sod-history-when">{formatEventTime(event.at)}</span>
                <span className="sod-history-what">{event.text}</span>
                {event.location && <span className="sod-history-where">{event.location}</span>}
              </li>
            ))}
          </ol>
        </details>
      )}
    </div>
  )
}
