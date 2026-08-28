// PROTECTED - payment provider integration (spec section 7).
import type { ShpPaymentMethod, ShpPaymentStatus } from '@/modules/shop/lib/types'

export type ShpOrderDraft = {
  orderId: string
  orderNumber: string
  amount: number // major currency units, e.g. 19.99
  currency: string
  customerEmail: string
  customerName: string
  // Where to put the shopper down afterwards, for a provider that sends them
  // off to its own site. Absent on an ordinary checkout, which is the case every
  // provider already handles: the shop's own confirmation page.
  //
  // Set when the payment is being taken against an order that already exists -
  // the customer settling a bank transfer from their own order page - because a
  // thank-you page for an order placed a fortnight ago is not where that person
  // was going. A same-site path beginning with a single '/', never a URL: it is
  // pasted into a redirect the provider will send the shopper to, and a provider
  // that accepted an absolute one would happily forward them anywhere.
  //
  // Optional, and safely ignored: a provider that has not been taught about it
  // simply lands them on the confirmation page as it always did.
  returnPath?: string
}

export interface ShpPaymentProvider {
  id: ShpPaymentMethod
  label: string
  // Optional: the name to show for this method at checkout and in the admin on
  // a shop whose owner gets to name it themselves. Resolved per request, so a
  // provider is free to read it from its own settings. `label` is the fallback
  // for a provider that does not offer one, or whose owner left it blank -
  // never leaving the method nameless.
  getLabel?(): Promise<string>
  // Optional: the line printed under the method's name at checkout, saying who
  // handles the money. The provider's own wording, and only a default - the shop
  // owner can write their own over the top of it on the Payments tab, and a
  // method that offers none simply gets no line unless they write one.
  description?: string
  // Optional: the publishable, ORDER-INDEPENDENT half of what this provider's
  // on-page fields need in the browser - a publishable application key, which
  // of its environments it is in. Resolved once for the whole checkout and put
  // on the public config, so the fields can be drawn the moment the shopper
  // picks the method.
  //
  // This exists because the per-order `clientFields` on ShpPaymentIntent cannot
  // do that job on its own. An intent creates a draft order, and the route that
  // makes one refuses until the contact details are filled in and every
  // compulsory tickbox is ticked - so fields fed only by the intent stayed
  // invisible until the shopper had agreed to the terms, which is well past the
  // point they expect to see a card box. Whatever the intent later hands over
  // (the amount to authorise, an id for this attempt) is merged over the top.
  //
  // It goes over the wire to a public checkout unconditionally, for every
  // shopper who loads the page, so a provider puts only publishable things in
  // it. Never a secret, never anything order-specific.
  getClientFields?(): Promise<Record<string, unknown> | null>
  // Optional: the provider's own brand mark, shown beside its name at checkout.
  // A provider that ships none simply gets a name, which is what every method
  // had before this existed.
  logo?: ShpPaymentLogo
  // Where the order row comes from for this method.
  //
  //  'immediate' (the default, and what every method did before this existed) -
  //      the order is written PENDING before the payment intent, so a webhook or
  //      a confirm call always has a row to update. Right for a method that
  //      takes the money with the shopper still on this page, and for one
  //      somebody settles by hand later: in both cases the order is a real thing
  //      the moment it is placed.
  //
  //  'on-payment' - nothing is written until the money is committed. Right for a
  //      method that hands the shopper over to a bank or a hosted payment page,
  //      because the shop loses sight of them at the door and most of the people
  //      who leave never come back. The checkout drafts the order instead and
  //      the settlement path creates it (see lib/checkout-draft.ts), so a
  //      shopper who thinks better of it on somebody else's site leaves nothing
  //      behind in the orders list.
  //
  // A provider choosing 'on-payment' takes on one duty in return: every path
  // that settles a payment must call materialiseDraftOrder before it touches the
  // order, and must NOT call it when the payment has failed.
  orderCreation?: 'immediate' | 'on-payment'
  // 'manual' providers (bank transfer, cash) have no automated confirmation -
  // the confirm route parks the order at AWAITING_CONFIRMATION for an admin to
  // clear, rather than calling confirmPayment. Defaults to 'auto' when unset.
  confirmMode?: 'auto' | 'manual'
  // Whether this provider can take payment for an order that ALREADY EXISTS -
  // an unpaid bank transfer the customer would rather settle by card from their
  // own order page (see lib/order-pay-online.ts).
  //
  // Opt-in, and false when unset, because it is a promise about the whole
  // settlement path rather than about createIntent alone. A provider claiming it
  // undertakes that:
  //   - createIntent works against an order that is already a row, not a draft;
  //   - every path that settles it (return route, webhook, confirmPayment) is
  //     content to find the order already there - materialiseDraftOrder returns
  //     the existing order, so a provider that goes through it already is;
  //   - nothing it does assumes the shopper is mid-checkout with a basket.
  //
  // Shop's own STRIPE and PAYPAL are deliberately not claiming it yet: both need
  // client-side glue that lives in the checkout block and nowhere else, and half
  // a payment path is worse than none.
  settlesExistingOrder?: boolean
  // Module-contributed providers self-gate on their own env/settings so a method
  // can never reach checkout without being configured. Built-in providers are
  // gated by lib/env.ts instead; when unset the method is treated as available.
  isAvailable?(): boolean | Promise<boolean>
  createIntent(order: ShpOrderDraft): Promise<ShpPaymentIntent>
  // order carries amount/currency so providers can re-validate what was actually
  // charged against what the order costs - never trust payload alone (spec 7).
  confirmPayment(order: ShpOrderDraft, payload: unknown): Promise<ShpPaymentResult>
  // 'manual' providers move no money of their own when a refund is recorded -
  // bank transfer and cash both need somebody to send the money themselves, and
  // the refund modal says so in as many words. They still RECORD the refund:
  // the quantities come off, the order status follows, and the credit note goes
  // out, because from the shop's point of view the money has been given back.
  // Only the actual transfer is off-platform.
  //
  // Refusing instead (which is what they did before this existed) meant a
  // bank-transfer shop could never record a refund at all - so its books kept
  // the whole sale, its stock never came back, and the customer got no credit
  // note, all while the screen promised the opposite. Defaults to 'provider'.
  refundMode?: 'provider' | 'manual'
  refundOrder(refund: ShpRefundRequest): Promise<ShpRefundResult>
  handleWebhook?(req: Request): Promise<ShpWebhookResult>
  // Optional: answers "did this refund actually happen?" for a refund row whose
  // outcome was never recorded. Only the stale-PENDING reconciler calls it. A
  // provider that cannot answer simply omits it, and its stale rows are reported
  // to the owner instead of being resolved automatically.
  getRefundStatus?(refundRowId: string, providerReference: string | null): Promise<ShpRefundStatusLookup>
}

// A payment provider's brand mark. The images are self-contained (a data: URI
// holding the mark itself) rather than URLs: a module has nowhere of its own to
// serve a static file from, and a checkout should not wait on a second request
// to show who is taking the money. `width`/`height` are the mark's own
// proportions - checkout renders it at a fixed height and works the rest out.
// A mark that reads on either background gives only `light`; one that needs a
// different colourway in the dark theme gives `dark` as well, and core's
// logo-swap CSS shows the right one before paint.
export type ShpPaymentLogo = {
  light: string
  dark?: string
  // Left off by providers whose mark sits beside their name anyway - the name
  // is already the accessible label, and a screen reader reading "Square
  // Square" helps nobody.
  alt?: string
  width: number
  height: number
}

// Deliberately three-valued. 'unknown' is not a failure - it means do not touch
// the row, because guessing about money in either direction is worse than
// leaving it flagged for a human.
export type ShpRefundStatusLookup =
  | { status: 'succeeded'; providerRefundId: string | null }
  | { status: 'failed' }
  | { status: 'unknown' }

export type ShpPaymentIntent = {
  clientSecret?: string // Stripe
  approvalUrl?: string // PayPal
  instructions?: string // Bank transfer / cash
  providerOrderId?: string
  // Whatever this provider's own on-page card fields need in the browser - a
  // publishable key, the amount to authorise, which of its environments it is
  // in. Relayed verbatim to the client component the provider's module
  // registered on 'shop.checkout-payment-fields' (see
  // components/public/checkout-payment-fields.ts); shop never reads it.
  //
  // It goes over the wire to a public checkout, so a provider puts only
  // publishable things in it. Nothing secret, and nothing the client could act
  // on unilaterally - the server still asks the provider whether the money
  // actually moved.
  clientFields?: Record<string, unknown>
}

export type ShpPaymentResult = {
  success: boolean
  // Confirmation is genuine but not yet final (e.g. an open-banking payment that
  // is authorised and awaiting settlement). The confirm route parks the order at
  // AWAITING_CONFIRMATION and lets the provider's webhook flip it to PAID.
  pending?: boolean
  providerReference?: string
  error?: string
}

export type ShpRefundRequest = {
  providerReference: string
  amount: number
  currency: string
  items: Array<{ name: string; quantity: number; amount: number }>
  // Deterministic per-refund key (the shop passes the refund row id). Providers
  // that support it forward it as the upstream idempotency key so a retried
  // refund call can never charge the same refund twice. Optional: providers may
  // ignore it.
  idempotencyKey?: string
}

export type ShpRefundResult = {
  success: boolean
  providerRefundId?: string
  error?: string
}

export type ShpWebhookResult = {
  orderId?: string
  status?: ShpPaymentStatus
  providerReference?: string
  error?: string
}
