import OrderAccessForm from '@/modules/shop/components/public/OrderAccessForm'
import { TRACK_ORDER_CSS } from '@/modules/shop/components/public/track-order-css'

// The postcode gate, drawn in place of an invoice, credit note or proforma that
// this browser has not proved itself against.
//
// In place, and not a redirect, because the visitor arrived from a link that
// already said which document this is - sending them somewhere to type a number
// back would be asking them to retype the thing they had just clicked. The
// commonest visitor here is the customer themselves, on the machine that did not
// place the order or a month after the proof on it expired.
//
// It names the document and nothing else about it. That is not a leak worth
// worrying about: the address it is on carries the same number, which is how
// they got here.
export default function DocumentAccessGate({
  title,
  challenge,
  kind,
  number,
  token,
}: {
  /** What to call it - "Invoice INV-000087". The document's own words, since
   *  this component ships to shops that rename their paperwork. */
  title: string
  challenge: 'postcode' | 'email'
  kind: 'invoice' | 'credit-note' | 'proforma'
  number: string
  token: string
}) {
  return (
    <div style={{ maxWidth: 640, margin: '0 auto', padding: '2rem 1.5rem' }}>
      <style dangerouslySetInnerHTML={{ __html: TRACK_ORDER_CSS }} />
      <div className="sot">
        <header className="sot-head">
          <h1 className="sot-title">{title}</h1>
          <p className="sot-lede">
            {challenge === 'postcode'
              ? 'One quick check that it is you. Paperwork carries an address and what was paid, so give us the postcode the order is being delivered to and it is all yours.'
              : 'One quick check that it is you. Paperwork carries an address and what was paid, so give us the email address the order was placed with and it is all yours.'}
          </p>
        </header>

        <div className="sot-card">
          <OrderAccessForm mode="document" kind={kind} number={number} token={token} challenge={challenge} />
        </div>
      </div>
    </div>
  )
}
