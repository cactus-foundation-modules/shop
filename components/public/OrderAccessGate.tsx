import OrderAccessForm from '@/modules/shop/components/public/OrderAccessForm'
import { TRACK_ORDER_CSS } from '@/modules/shop/components/public/track-order-css'

// The postcode gate, drawn in place on an order page nobody has proved
// themselves against yet.
//
// In place, and not a redirect to the tracker, because the visitor arrived here
// from a link that already said which order this is. Sending them to a form
// that asks for the order number as well would be asking them to type back the
// thing they had just clicked - and the commonest visitor here is somebody
// whose proof simply expired, thirty days after they last looked.
//
// It says the order number and nothing else about the order. That is not a leak
// worth worrying about: the address it is on carries the order's own id, which
// is a random UUID and is how they got here.
export default function OrderAccessGate({
  orderId,
  orderNumber,
  trackerPath,
}: {
  orderId: string
  orderNumber: string
  /** Where "look up a different one" goes - the shop's own front door for this,
   *  which the owner may have moved to the root of the site. */
  trackerPath: string
}) {
  return (
    <div style={{ maxWidth: 640, margin: '0 auto', padding: '2rem 1.5rem' }}>
      <style dangerouslySetInnerHTML={{ __html: TRACK_ORDER_CSS }} />
      <div className="sot">
        <header className="sot-head">
          <h1 className="sot-title">Order {orderNumber}</h1>
          <p className="sot-lede">
            One quick check that it is you: give us the postcode this order is being delivered to and
            we will show you everything about it - where it has got to, your paperwork, and anything
            you still need to do.
          </p>
        </header>

        <div className="sot-card">
          <OrderAccessForm mode="confirm" orderNumber={orderNumber} orderId={orderId} />
        </div>

        <p className="sot-hint">
          Not the right order? <a href={trackerPath}>Look up a different one</a>.
        </p>
      </div>
    </div>
  )
}
