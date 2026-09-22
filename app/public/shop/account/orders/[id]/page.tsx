import { getSiteTimezone } from '@/lib/config/timezone.server'
import Link from 'next/link'
import { redirect, notFound } from 'next/navigation'
import { getMemberFromCookie } from '@/lib/members/session'
import { getMembersConfig } from '@/lib/members/config'
import { getMemberAreaPath } from '@/lib/members/paths'
import { moduleAccountSectionAnchor } from '@/lib/members/account-layout'
import MemberAccountShell from '@/components/members/account/MemberAccountShell'
import { loadOrderDetail } from '@/modules/shop/lib/member-orders'
import { getOrderById } from '@/modules/shop/lib/db/orders'
import { guestOrderAccessIds } from '@/modules/shop/lib/guest-order-access'
import { orderViewerFor } from '@/modules/shop/lib/order-viewer'
import { orderTrackingBasePath } from '@/modules/shop/lib/order-tracking'
import OrderAccessGate from '@/modules/shop/components/public/OrderAccessGate'
import GuestOrderAccountOffer from '@/modules/shop/components/public/GuestOrderAccountOffer'
import { getShopConfigCached } from '@/modules/shop/lib/config'
import { formatMoney } from '@/modules/shop/lib/money'
import {
  SHP_CANCEL_REASONS,
  SHP_DAMAGE_REASONS,
  SHP_RETURN_REASONS,
  REPORT_ISSUE_QUERY_KEY,
  reasonLabel,
  type RequestEligibility,
} from '@/modules/shop/lib/order-requests'
import { orderLinkIntentSet } from '@/modules/shop/lib/order-link-intent'
import {
  ORDER_STATUS_DISPLAY,
  REQUEST_STATUS_DISPLAY,
  REQUEST_TYPE_LABEL,
  addressLines,
  badgeClass,
  formatDeliveredDay,
  formatOrderDate,
  formatOrderDateTime,
  orderCompanyName,
} from '@/modules/shop/lib/order-display'
import { orderProgressSteps, orderStopped } from '@/modules/shop/lib/order-progress'
import { ParcelTracking } from '@/modules/shop/components/public/ParcelTracking'
import { DEFAULT_TRACKING_LABEL, parcelDelivery, railDelivery, type ParcelDelivery } from '@/modules/shop/lib/order-delivery'
import { formatDeliveredDayRelative, nowInTimezone } from '@/modules/shop/lib/delivery-slot'
import { calendarDateIn } from '@/lib/config/timezone'
import { courierForShipment } from '@/modules/shop/lib/courier-faqs'
import { courierIsPolled } from '@/modules/shop/lib/tracking/stage-meaning'
import { livePollIntervalMs, positionFreshness } from '@/modules/shop/lib/tracking/live-delivery'
import DeliveryLiveMap, { type LiveDeliveryState } from '@/modules/shop/components/public/DeliveryLiveMap'
import { FAQ_QUERY_KEY } from '@/modules/shop/lib/courier-faqs'
import { listInvoicesForOrder } from '@/modules/shop/lib/db/invoices'
import { listCreditNotesForOrder } from '@/modules/shop/lib/db/credit-notes'
import {
  creditNotePath, creditNotePdfPath, invoicePath, invoicePdfPath, proformaPath, proformaPdfPath,
} from '@/modules/shop/lib/invoice-token'
import { customerBillingEditOffered, customerCanEditBilling } from '@/modules/shop/lib/customer-billing'
import OrderBillingPanel from '@/modules/shop/components/public/OrderBillingPanel'
import { manualPaymentInstructions, paymentOutstanding } from '@/modules/shop/lib/payment-instructions'
import { payOnlineMethodsForOrder, settlementMethod } from '@/modules/shop/lib/order-pay-online'
import { getPaymentMethodLabels, getPaymentMethodClientFields } from '@/modules/shop/lib/payments/registry'
import { resolveCheckoutPaymentFields } from '@/modules/shop/lib/checkout-payment-fields'
import { OrderPayOnlinePanel } from '@/modules/shop/components/public/OrderPayOnlinePanel'
import { proformaAvailable } from '@/modules/shop/lib/proforma'
import OrderRequestPanel from '@/modules/shop/components/public/OrderRequestPanel'
import OrderReferencePanel from '@/modules/shop/components/public/OrderReferencePanel'
import {
  customerCanSetReference,
  customerReferenceLabel,
  customerReferenceOfferedAfterOrder,
} from '@/modules/shop/lib/customer-reference'
import WithdrawRequestButton from '@/modules/shop/components/public/WithdrawRequestButton'
import { safeTrackingUrl } from '@/modules/shop/lib/tracking-url'
import { ORDER_DETAIL_CSS } from '@/modules/shop/components/public/order-detail-css'
import { Icon, ICON_DOWNLOAD, OrderCard, OrderNote } from '@/modules/shop/components/public/OrderDetailChrome'
import { OrderProgressRail } from '@/modules/shop/components/public/OrderProgressRail'
import { CourierFaqModal } from '@/modules/shop/components/public/CourierFaqModal'
import { OrderItemList } from '@/modules/shop/components/public/OrderItemList'
import { OrderDocuments, type OrderDocument } from '@/modules/shop/components/public/OrderDocuments'
import { resolveShopMemberOrderPanels } from '@/modules/shop/lib/member-order-panels'

export const metadata = { title: 'Order detail' }
export const dynamic = 'force-dynamic'

/** One of the three offers, as the panel wants it.
 *
 * A refusal marked `silent` hands down no reason at all. The endpoint still
 * answers with one, but a customer looking at an order placed this morning does
 * not need two lines telling them nothing has been dispatched yet - they can
 * see that, and printing it turns the card into a list of things they cannot
 * do. See RequestEligibility in lib/order-requests.ts. */
function offer(eligibility: RequestEligibility): { allowed: boolean; reason?: string } {
  if (eligibility.allowed) return { allowed: true }
  return { allowed: false, reason: eligibility.silent ? undefined : eligibility.reason }
}

// A member's own order, a week after they placed it.
//
// The page had grown a section at a time until it was eleven identical grey
// cards in one column - pay online, proforma, invoice address, purchase order
// number, items, parcels, downloads, totals, refunds, addresses, requests - all
// at the same volume, with the paperwork strung off the date line as middot
// separated links. Everything on it was needed; none of it was ranked.
//
// It now reads in the order somebody actually wants it:
//
//   1. Which order is this          - number, state, date, size, money
//   2. Where has it got to          - the progress rail
//   3. Anything still to do         - money owed, a request in flight
//   4. What was bought and paid     - the receipt, items and totals in one card
//   5. Everything else              - paired cards, two up on a desktop
//
// Layout classes come from order-detail-css.ts, injected once here. Nothing on
// this page carries a hardcoded colour.

// When an invoice turns up, in the buyer's words rather than the setting's.
// MANUAL promises no moment because the shop has not committed to one.
const INVOICE_WHEN: Record<string, string> = {
  COMPLETED: 'will be available on completion of your order',
  PAID: 'will be available once your payment has cleared',
  DISPATCHED: 'will be available once your order has been despatched',
  MANUAL: 'will appear here once it has been raised',
}

// Preferred wording for the four shop ships with. Anything else - a method a
// module contributed - is named by the registry, so a paid order never reads
// "GOCARDLESS_IBP" at its customer.
const PAYMENT_METHOD_LABELS: Record<string, string> = {
  STRIPE: 'Card',
  PAYPAL: 'PayPal',
  BANK_TRANSFER: 'Bank transfer',
  CASH: 'Cash',
}

// What a stopped order says instead of a progress rail. There is no next step
// to point at, and four greyed-out circles under "Cancelled" reads as a page
// that has not noticed.
const STOPPED_MESSAGE: Record<string, string> = {
  CANCELLED: 'This order was cancelled, so nothing further will be sent.',
  REFUNDED: 'This order was refunded in full.',
}

function TotalRow({ label, value, variant }: { label: React.ReactNode; value: string; variant?: string }) {
  return (
    <div className={variant ? `sod-row ${variant}` : 'sod-row'}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  )
}

export default async function ShopAccountOrderDetailPage({ params, searchParams }: {
  params: Promise<{ id: string }>
  // Only read for one thing: ?faq=1, which is the link in the delivery email
  // asking this page to open its delivery questions on arrival.
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}) {
  // Deliberately NOT behind the shop gate: an order already placed is still
  // owed its tracking, its payment details and its paperwork while the shop is
  // closed (see getShopGate in lib/access.ts).
  const { id } = await params
  // The order alone first, and only then everything hanging off it. Who may
  // look at this is decided from the order's own memberId and a cookie, and a
  // page that fetched the parcels, the refunds and the paperwork before asking
  // that question would do a dozen queries for a stranger. The row is read
  // twice on the way through - once here, once inside loadOrderDetail - and one
  // extra lookup by primary key is a fair price for not loading a stranger's
  // order history to find out they are a stranger.
  const [order, config, membersConfig] = await Promise.all([
    getOrderById(id),
    getShopConfigCached(),
    getMembersConfig(),
  ])
  if (!order) notFound()

  // Two ways to be allowed in: signed in and it is yours, or you have already
  // proved the delivery postcode. See lib/order-viewer.ts - the same rule the
  // routes behind every button on this page ask.
  const [signedInMember, guestOrderIds] = await Promise.all([getMemberFromCookie(), guestOrderAccessIds()])
  const viewer = orderViewerFor(order, signedInMember, guestOrderIds)

  if (!viewer) {
    // Neither. A shop that offers guest tracking asks them to prove it, right
    // here, because they arrived from a link that already said which order this
    // is and sending them off to type the number back would be absurd.
    if (config.guestOrderTrackingEnabled) {
      return (
        <OrderAccessGate
          orderId={order.id}
          orderNumber={order.orderNumber}
          trackerPath={orderTrackingBasePath(config)}
        />
      )
    }
    // A shop that does not: exactly what it always did. Somebody else's order is
    // a 404 rather than a 403, since "not yours" would confirm the id exists.
    if (signedInMember) notFound()
    redirect(`/${getMemberAreaPath()}/login?redirect=/shop/account/orders`)
  }

  const member = viewer.member
  // A member page needs the member area switched on; a guest's own order does
  // not, and never did - it is their receipt, not part of anybody's account.
  if (member && !membersConfig.enabled) notFound()

  const [detail, timezone] = await Promise.all([loadOrderDetail(id), getSiteTimezone()])
  if (!detail) notFound()

  // `order` is already in hand from the access check above, so it is not taken
  // from the detail a second time.
  const { lines, shipments, refunds, refundItems, downloads, requests, openRequest, openDamageRequests, replacements, parentOrder } = detail
  const symbol = config.currencySymbol
  // Only looked up on a shop that invoices AND is willing to show it, so an
  // ordinary shop's order page costs exactly what it always did.
  const showPaperwork = config.invoicesEnabled && config.invoiceShowToCustomer
  // Whether this shop lets the customer put their own reference on afterwards.
  // Read first because it is the other reason the invoice is worth looking up:
  // an invoice already sent with a number on it is what closes the box (see
  // lib/customer-reference.ts), and that is true whether or not the shop shows
  // the invoice to the customer at all.
  const referenceOffered = customerReferenceOfferedAfterOrder(config)
  // Whether this shop lets the customer correct who the invoice is made out to.
  // The third reason to look the invoice up: what a change costs depends on
  // whether one has gone out (see lib/customer-billing.ts).
  const billingOffered = customerBillingEditOffered(config)
  // Every invoice this order has ever had, not just the live one. An order
  // whose company was corrected after invoicing has two - the one that was
  // credited and the one that replaced it - and the customer's own accountant
  // needs both, which is the whole reason the first was superseded rather than
  // voided.
  const invoiceRecords = showPaperwork || ((referenceOffered || billingOffered) && config.invoicesEnabled)
    ? await listInvoicesForOrder(order.id)
    : []
  // The live one: issued, and not since replaced. What "the invoice" means to
  // the reference rules, to the proforma and to the billing panel.
  const invoiceRecord = invoiceRecords.find((record) => record.status === 'ISSUED' && !record.supersededAt) ?? null
  // The one the paperwork links read. A shop that raises invoices and keeps them
  // to itself still has none to offer here, exactly as before.
  const invoice = showPaperwork ? invoiceRecord : null
  // Everything downloadable, oldest first so the story reads in order: the
  // invoice that went out, then the one that replaced it. Voided ones stay off
  // - a withdrawn document is the one thing a customer must not be handed a
  // fresh copy of.
  const issuedInvoices = showPaperwork
    ? invoiceRecords.filter((record) => record.status === 'ISSUED').slice().reverse()
    : []
  // Money that went back is paperwork the buyer is owed just as much as the
  // invoice - more so for a business buyer, whose own accountant needs the
  // document rather than a line on a card statement. Only read where there is
  // an invoice to credit, so an ordinary shop's order page costs what it did.
  const creditNotes = issuedInvoices.length > 0 ? await listCreditNotesForOrder(order.id) : []
  // Where "back" goes, which depends on where they came from. A member goes to
  // their order history - and on a one-page account that history is a stretch of
  // the account itself rather than a page of its own. A guest has no history to
  // go back to, so back means the place they look orders up.
  const backHref = member
    ? (membersConfig.accountSinglePage
        ? `/${getMemberAreaPath()}#${moduleAccountSectionAnchor('orders')}`
        : '/shop/account/orders')
    : orderTrackingBasePath(config)
  const backLabel = member ? 'All orders' : 'Track another order'
  // Whether the paperwork links hand over a file or open the document.
  const pdfDownloads = config.invoicePdfEnabled
  // Before one has been raised, say so rather than leaving a gap where the link
  // will be - "where is my invoice?" is the email this line exists to prevent.
  // The moment named is the one the shop actually issues on, and the tax label
  // is the shop's own, so a shop outside the UK is not made to say VAT.
  const invoicePromise = showPaperwork && !invoice ? INVOICE_WHEN[config.invoiceIssueOn] : null
  const status = ORDER_STATUS_DISPLAY[order.status]
  const completedRefunds = refunds.filter((refund) => refund.status === 'COMPLETED')
  const refundedTotal = completedRefunds.reduce((sum, refund) => sum + Number(refund.amount), 0)
  const itemsById = new Map(lines.map((line) => [line.item.id, line.item]))
  const decided = requests.filter((request) => request.status !== 'PENDING')
  const itemCount = lines.reduce((sum, line) => sum + line.item.quantity, 0)

  // The method to SPEAK about, which on an unpaid order is the one it was placed
  // with. A customer who started a card payment here and thought better of it
  // still wants the bank details on the page. See lib/order-pay-online.ts.
  const shownMethod = settlementMethod(order)
  const paymentInstructions = manualPaymentInstructions(shownMethod, config)
  const outstanding = paymentOutstanding(order)
  // The ways this order could be settled here and now, and the two things a
  // method's own on-page fields need to draw. Only looked up while money is
  // actually owed, so a settled order's page costs exactly what it always did.
  const payOnline = outstanding ? await payOnlineMethodsForOrder(order, config) : []
  const payOnlineFields = payOnline.length > 0 ? await getPaymentMethodClientFields() : {}
  // Every registered method's name, so a method a module contributed is named
  // rather than shouted in upper case.
  const methodLabels = await getPaymentMethodLabels()
  // The proforma, on a pay-later order, until the real invoice exists.
  //
  // A proforma is a request for money; a VAT invoice is the record of the sale,
  // and it is the one an accountant files and reclaims against. Offering both
  // side by side invites somebody to hand their bookkeeper the wrong one - and
  // the proforma says in as many words that it is not a VAT invoice, which is
  // not a document anybody needs once there is a VAT invoice sitting beside it.
  //
  // It is kept while the money is still owed, paid or not: a buyer who paid by
  // transfer but is waiting on despatch still needs the paperwork they paid
  // against. It goes when the invoice arrives, not when the money does.
  //
  // `invoice` is null on a shop that raises invoices but keeps them to itself,
  // and the proforma rightly stays there - it is then the only paperwork the
  // customer has, and taking it away would leave them with nothing.
  const proforma = config.proformaShowToCustomer && proformaAvailable(config, order) && !invoice

  // Their own reference for the order, and whether they may still move it.
  // Shown read-only on a shop that asks for one at checkout but does not take
  // changes afterwards: somebody who typed a purchase order number in on the day
  // should still be able to see it on their own order.
  const referenceLabel = customerReferenceLabel(config)
  const referenceEditable: { allowed: boolean; reason?: string } = referenceOffered
    ? customerCanSetReference({ config, order, invoiceReference: invoiceRecord?.customer?.reference ?? null })
    : { allowed: false }
  const showReference = config.customerReferenceFieldEnabled
    && (referenceOffered || Boolean(order.customerReference?.trim()))

  // The latest parcel out, which is what the rail dates its dispatch step from.
  const lastShippedAt = shipments.reduce<Date | null>(
    (latest, shipment) => (!latest || shipment.shippedAt > latest ? shipment.shippedAt : latest),
    null,
  )
  const stopped = orderStopped(order.status)

  // The deliveries booked on this order's parcels, worked out once against a
  // single clock reading: the rail, the parcels card and the questions all
  // describe the same moment, and taking `new Date()` three times would let a
  // window close between two of them.
  const now = new Date()
  const deliveries = shipments.map((shipment) => parcelDelivery(config, shipment, now, timezone))
  const deliveryById = new Map(deliveries.map((d) => [d.shipmentId, d]))
  const railBooking = railDelivery(deliveries)

  // When each parcel actually arrived, where the courier told us - their own
  // signing time first, then when we noticed. Worked out once here rather than
  // inline, so the parcels card and anything else asking the question get the
  // same answer.
  const deliveredOn = new Map<string, Date>(
    shipments
      .map((s) => [s.id, s.signedAt ?? s.deliveredAt] as const)
      .filter((entry): entry is readonly [string, Date] => entry[1] instanceof Date),
  )

  const deliveredItemIds = new Set<string>()
  for (const shipment of shipments) {
    if (!shipment.deliveredAt && !shipment.signedAt && !shipment.signedBy?.trim()) continue
    for (const item of shipment.items) deliveredItemIds.add(item.orderItemId)
  }

  /** 'today', 'yesterday' or '8/9/26', in the shop's own timezone. The instant
   *  is turned into a calendar day first: a delivery at half past midnight is
   *  remembered by the day it happened where it happened, not by whatever day
   *  it was in UTC at the time. */
  const deliveredDayFor = (at: Date): string =>
    formatDeliveredDayRelative(calendarDateIn(at, timezone), nowInTimezone(now, timezone).date)

  const steps = orderProgressSteps({
    order,
    lines,
    lastShippedAt,
    delivery: railBooking
      ? {
          day: railBooking.day,
          window: railBooking.window,
          progress: railBooking.progress?.progress ?? 0,
          // The courier's own word first, the clock only as a fallback: a
          // booked window says what was planned, the tracking page says what is
          // happening.
          underway: !railBooking.arrived
            && (railBooking.outForDelivery || railBooking.progress?.phase === 'during'),
          arrived: railBooking.arrived,
          // The day it actually came, where the courier gave one. Worded here
          // because this is where the timezone is.
          deliveredOn: deliveredOn.has(railBooking.shipmentId)
            ? deliveredDayFor(deliveredOn.get(railBooking.shipmentId) as Date)
            : null,
        }
      : null,
  })

  // The van only ticks along for a delivery that has not been yet - once the
  // window has gone there is nothing left to animate, and a van still creeping
  // across a rail the morning after is somebody's furniture being described as
  // "on its way" when it is not.
  const railShipment = railBooking ? shipments.find((s) => s.id === railBooking.shipmentId) ?? null : null
  const van = railBooking && !railBooking.arrived
    ? {
        date: railBooking.date,
        slotStart: railBooking.slotStart,
        slotEnd: railBooking.slotEnd,
      }
    : null

  // The van, for the parcel the rail is describing. Everything here is read
  // from what the scheduled job last stored, so the page renders with a van
  // already on it and no third party in the way of it loading; the component
  // then keeps it moving on its own clock. See the live-delivery route.
  //
  // Offered only while a van is genuinely out with this parcel: a courier the
  // shop polls, a stage that means out for delivery, and nothing delivered yet.
  const liveShipment = railShipment
    && railBooking?.outForDelivery
    && !railBooking.arrived
    && courierIsPolled(courierForShipment(config, railShipment))
    ? railShipment
    : null
  const liveDelivery: LiveDeliveryState | null = liveShipment
    ? {
        live: true,
        crewLine: liveShipment.crewLine,
        dropsAway: liveShipment.dropsAway,
        destination: liveShipment.destinationLat && liveShipment.destinationLng
          ? { lat: liveShipment.destinationLat, lng: liveShipment.destinationLng }
          : null,
        arrived: false,
        pollAfterMs: livePollIntervalMs(liveShipment.dropsAway),
        position: liveShipment.vehicleLat && liveShipment.vehicleLng
          ? {
              lat: liveShipment.vehicleLat,
              lng: liveShipment.vehicleLng,
              heading: liveShipment.vehicleHeading,
              fixedAt: liveShipment.vehicleFixedAt ? liveShipment.vehicleFixedAt.toISOString() : null,
            }
          : null,
        freshness: positionFreshness(liveShipment.vehicleFixedAt, now),
      }
    : null

  // Which parcel's questions the delivery email asked for. One order, one set
  // of questions on screen: with two parcels out with the same courier the
  // questions are the same questions, so the first booked delivery that has any
  // is the one that answers for the order.
  //
  // Only parcels that have not arrived. Every one of these questions is about
  // something that has not happened yet - will they take it upstairs, what
  // happens if nobody is in, do they ring first - and a delivered parcel still
  // offering to answer them is the shop asking a question the van settled an
  // hour ago. A link from an older email lands on the page as normal and simply
  // opens nothing, which is the behaviour a stale link has always had here.
  const questionsFor = (shipmentId: string): boolean =>
    !deliveredOn.has(shipmentId) && (deliveryById.get(shipmentId)?.faqs.length ?? 0) > 0

  const query = searchParams ? await searchParams : {}
  const faqRequested = orderLinkIntentSet(query, FAQ_QUERY_KEY)
  // "Something not right with your order?" in an email, one click from the form
  // rather than from a page they then have to read for the right button. The
  // panel checks for itself whether it can honour it.
  const reportRequested = orderLinkIntentSet(query, REPORT_ISSUE_QUERY_KEY)
  const faqShipmentId = deliveries.find((d) => questionsFor(d.shipmentId))?.shipmentId ?? null

  // How this order was settled, in a sentence rather than a status code.
  const methodName = PAYMENT_METHOD_LABELS[shownMethod] ?? methodLabels[shownMethod] ?? shownMethod
  const paymentWhen = order.paidAt
    ? `Paid on ${formatOrderDate(order.paidAt, timezone)}`
    : order.paymentStatus === 'PENDING'
      ? 'Not received yet'
      : order.paymentStatus === 'AWAITING_CONFIRMATION'
        ? 'Waiting to clear'
        : order.paymentStatus === 'FAILED'
          ? 'That payment did not go through'
          : null

  // Cards a companion module has for this order - somewhere to review what was
  // bought, in practice. Resolved here rather than inside the JSX because a
  // provider reads the database, and shop is told nothing about what comes back.
  // On a shop with no such module installed this is a single map lookup that
  // finds nothing and returns [] - see lib/member-order-panels.ts.
  const memberOrderPanels = await resolveShopMemberOrderPanels({
    orderId: order.id,
    orderNumber: order.orderNumber,
    status: order.status,
    paymentStatus: order.paymentStatus,
    customerEmail: order.customerEmail,
    customerName: order.customerName,
    // A member is known by their account; a guest who proved the postcode is
    // known by the order itself, which is the only address they have here.
    viewerEmail: member?.email ?? order.customerEmail,
    viewerName: member ? member.displayName || member.username : order.customerName,
    signedIn: !!member,
    productIds: Array.from(
      new Set(lines.map((line) => line.item.productId).filter((id): id is string => !!id)),
    ),
  })

  // Split by where each provider asked to sit. Both halves keep the resolver's
  // ordering, so a module that contributes two cards keeps them in its own order
  // on whichever side of the receipt it put them.
  const panelsBeforeItems = memberOrderPanels.filter((panel) => panel.placement === 'before')
  const panelsAfterItems = memberOrderPanels.filter((panel) => panel.placement !== 'before')

  // Every piece of paper this order has, in the order it came into existence.
  // The receipt is always first because it is the only one every shop has.
  const documents: OrderDocument[] = [{
    key: 'receipt',
    name: 'Printable receipt',
    href: `/shop/account/orders/${order.id}/receipt`,
    action: 'Print',
    newTab: true,
    icon: 'print',
    internal: true,
  }]
  for (const record of issuedInvoices) {
    documents.push({
      key: record.id,
      name: `Invoice ${record.invoiceNumber}`,
      // Said plainly rather than left for somebody to work out from two invoice
      // numbers on one order.
      note: record.supersededAt ? 'Cancelled and replaced' : null,
      href: pdfDownloads ? invoicePdfPath(record.invoiceNumber) : invoicePath(record.invoiceNumber),
      action: pdfDownloads ? 'Download' : 'Open',
      icon: 'doc',
    })
  }
  if (proforma) {
    documents.push({
      key: 'proforma',
      name: 'Proforma invoice',
      href: pdfDownloads ? proformaPdfPath(order.orderNumber) : proformaPath(order.orderNumber),
      action: pdfDownloads ? 'Download' : 'Open',
      icon: 'doc',
    })
  }
  for (const note of creditNotes) {
    documents.push({
      key: note.id,
      name: `Credit note ${note.creditNoteNumber}`,
      href: pdfDownloads ? creditNotePdfPath(note.creditNoteNumber) : creditNotePath(note.creditNoteNumber),
      action: pdfDownloads ? 'Download' : 'Open',
      icon: 'doc',
    })
  }
  if (invoicePromise) {
    documents.push({
      key: 'invoice-promise',
      name: `Your ${config.invoiceTaxLabel || 'VAT'} invoice ${invoicePromise}`,
      icon: 'doc',
    })
  }

  const body = (
    <>
      <style dangerouslySetInnerHTML={{ __html: ORDER_DETAIL_CSS }} />

      <div className="sod">
        <Link href={backHref} prefetch={false} className="sod-back">
          <span aria-hidden="true">←</span> {backLabel}
        </Link>

        <header className="sod-head">
          <div className="sod-head-top">
            <h1 className="sod-title">Order {order.orderNumber}</h1>
            <span className={badgeClass(status.tone)}>{status.label}</span>
          </div>
          {/* A replacement lands here looking like a mystery: a £0 order for one
              part nobody remembers buying. The order it is putting right is the
              answer, and it is the first thing under the title. */}
          {order.kind === 'REPLACEMENT' && parentOrder && (
            <p className="sod-facts">
              <span>
                Sent to put order{' '}
                <Link href={`/shop/account/orders/${parentOrder.id}`} prefetch={false}>
                  {parentOrder.orderNumber}
                </Link>
                {' '}right
              </span>
            </p>
          )}
          {/* The three facts that identify an order, and nothing to click. The
              links that used to live on this line have a card of their own. */}
          <p className="sod-facts">
            <span>Placed <strong>{formatOrderDate(order.createdAt, timezone)}</strong></span>
            <span><strong>{itemCount}</strong> {itemCount === 1 ? 'item' : 'items'}</span>
            <span>Total <strong>{formatMoney(order.total, symbol)}</strong></span>
            {showReference && order.customerReference?.trim() && (
              <span>{referenceLabel} <strong>{order.customerReference.trim()}</strong></span>
            )}
          </p>
        </header>

        {stopped ? (
          <OrderNote tone="warn">
            <p>{STOPPED_MESSAGE[order.status] ?? status.label}</p>
          </OrderNote>
        ) : (
          <OrderProgressRail steps={steps} timezone={timezone} van={van} />
        )}

        {/* Where the van actually is, while it is out. Under the rail rather
            than inside it: the rail is the order's whole life from placed to
            complete, and this is one afternoon of it. */}
        {liveDelivery && liveShipment && (
          <DeliveryLiveMap orderId={order.id} shipmentId={liveShipment.id} initial={liveDelivery} />
        )}

        {order.status === 'ON_HOLD' && (
          <OrderNote tone="warn">
            <p>
              <strong>This order is on hold.</strong> We have paused it while something is sorted
              out, and we will be in touch as soon as it is moving again.
            </p>
          </OrderNote>
        )}

        {/* The parts sent out to put this order right. Up here with the other
            notes rather than in a card further down: somebody who reported a
            broken leg opens this page to find out where the new one is, and
            making them scroll past the delivery address to find out is exactly
            the phone call this is meant to save. */}
        {replacements.length > 0 && (
          <OrderNote tone="ok">
            <p>
              <strong>
                {replacements.length === 1
                  ? 'We have sent a replacement.'
                  : `We have sent ${replacements.length} replacements.`}
              </strong>
            </p>
            <ul className="sod-replacements">
              {replacements.map(({ order: replacement, itemNames, fulfilment }) => (
                <li key={replacement.id}>
                  <Link href={`/shop/account/orders/${replacement.id}`} prefetch={false}>
                    {replacement.orderNumber}
                  </Link>
                  {itemNames.length > 0 && ` - ${itemNames.join(', ')}`}
                  {' · '}
                  {fulfilment === 'DISPATCHED'
                    ? 'on its way to you'
                    : fulfilment === 'PARTIAL'
                      ? 'partly on its way'
                      : 'being prepared'}
                </li>
              ))}
            </ul>
            <p>Follow the parcel on its own page, the same as any other order.</p>
          </OrderNote>
        )}

        {/* How to pay, for the methods where paying is still a job the shopper
            has to go and do. The thank-you page says this once, at a moment
            nobody is reading carefully; this is where they come back to it a
            week later with their banking app open, so it sits above everything
            else the page has to say.

            It is an outstanding task or it is nothing. Once the money has been
            marked as arrived there is no job left, and a panel of bank details
            on a settled order reads as a second demand for a bill already paid. */}
        {outstanding && (paymentInstructions || payOnline.length > 0) && (
          <OrderNote tone="warn">
            <p>
              <strong>How to pay - {formatMoney(order.total, symbol)} still to reach us</strong>
            </p>
            <p>Your order is awaiting payment confirmation. We will be in touch once it clears.</p>
            {paymentInstructions && <p className="sod-instructions">{paymentInstructions}</p>}
            {payOnline.length > 0 && (
              <>
                {/* Inside this callout rather than beside it: it is the same
                    question - how does this get paid - and two boxes asking it
                    would read as two different bills. */}
                <div className="sod-note-sep" />
                <OrderPayOnlinePanel
                  orderId={order.id}
                  amount={formatMoney(order.total, symbol)}
                  methods={payOnline}
                  // Who is paying, for a card SDK that has to send a name and an
                  // address with its 3D Secure request. The billing address where
                  // the order carries one, since that is the one the bank checks.
                  payer={{
                    email: order.customerEmail,
                    name: order.customerName,
                    address: order.billingAddress ?? order.shippingAddress,
                  }}
                  methodClientFields={payOnlineFields}
                  paymentFields={resolveCheckoutPaymentFields()}
                />
              </>
            )}
          </OrderNote>
        )}

        {openRequest && (
          <OrderNote tone="info">
            <p>
              <strong>{REQUEST_TYPE_LABEL[openRequest.type]} request sent.</strong>{' '}
              You asked on {formatOrderDate(openRequest.createdAt, timezone)} - reason given:{' '}
              {reasonLabel(openRequest.type, openRequest.reason)}. We will email you as soon as
              somebody has looked at it.
            </p>
            <div><WithdrawRequestButton requestId={openRequest.id} /></div>
          </OrderNote>
        )}

        {/* Its own note rather than a second branch of the one above: an issue
            report runs alongside a cancellation or a return rather than instead
            of one, and both can be open at once. One note each, because more
            than one report can be open too - and a customer who has told us
            about two faults needs to see two acknowledgements, each with its own
            way of taking it back. */}
        {openDamageRequests.map((report) => (
          <OrderNote key={report.id} tone="info">
            <p>
              <strong>Issue reported.</strong>{' '}
              You told us on {formatOrderDate(report.createdAt, timezone)} -{' '}
              {reasonLabel(report.type, report.reason)}
              {report.photos.length > 0 && `, with ${report.photos.length} photograph${report.photos.length === 1 ? '' : 's'}`}
              . We will email you as soon as somebody has looked at it.
            </p>
            <div><WithdrawRequestButton requestId={report.id} /></div>
          </OrderNote>
        ))}

        {/* Whatever a companion module has to say about this order, each in a
            card of shop's own so a contributed panel cannot arrive dressed
            differently from the rest of the page. These are the ones that ask
            the customer for something, so they go above the receipt rather than
            below a card that has already been read. */}
        {panelsBeforeItems.map(({ id: panelId, title, Panel, payload }) => (
          <OrderCard key={panelId} title={title}>
            <Panel payload={payload} />
          </OrderCard>
        ))}

        {/* The receipt: what was bought and what it came to, in one card rather
            than two sections half a screen apart. */}
        <OrderCard
          title="What you ordered"
          flush
          foot={(
            <dl className="sod-totals">
              <TotalRow label="Items" value={formatMoney(order.subtotal, symbol)} />
              {Number(order.discountAmount) > 0 && (
                <TotalRow
                  variant="sod-discount"
                  label={
                    order.couponCode
                      ? <>Discount <span className="sod-code">({order.couponCode})</span></>
                      : 'Discount'
                  }
                  value={`-${formatMoney(order.discountAmount, symbol)}`}
                />
              )}
              <TotalRow
                label={order.shippingRateName || 'Delivery'}
                value={formatMoney(order.shippingAmount, symbol)}
              />
              {Number(order.taxAmount) > 0 && (
                <TotalRow
                  label={order.taxMode === 'INCLUSIVE' ? 'VAT (included)' : 'VAT'}
                  value={formatMoney(order.taxAmount, symbol)}
                />
              )}
              <TotalRow variant="sod-grand" label="Total" value={formatMoney(order.total, symbol)} />
              {refundedTotal > 0 && (
                <>
                  <TotalRow label="Refunded" value={`-${formatMoney(refundedTotal, symbol)}`} />
                  <TotalRow
                    variant="sod-after"
                    label="Left after refunds"
                    value={formatMoney(Number(order.total) - refundedTotal, symbol)}
                  />
                </>
              )}
            </dl>
          )}
        >
          <OrderItemList
            lines={lines}
            currencySymbol={symbol}
            productUrlStyle={config.productUrlStyle}
            buyAgainEnabled={config.buyAgainEnabled}
            timezone={timezone}
            deliveredItemIds={deliveredItemIds}
          />
        </OrderCard>

        {/* The other half of the contributed cards: whatever a module would
            rather say once the customer has read what the order was. */}
        {panelsAfterItems.map(({ id: panelId, title, Panel, payload }) => (
          <OrderCard key={panelId} title={title}>
            <Panel payload={payload} />
          </OrderCard>
        ))}

        {/* Everything that is reference rather than headline. Two columns on a
            desktop, one on a phone - see .sod-grid. */}
        <div className="sod-grid">
          {shipments.length > 0 && (
            <OrderCard
              title={shipments.length === 1 ? 'Your parcel' : 'Your parcels'}
              note={shipments.length > 1 ? 'Parcels sent separately can arrive a day or two apart.' : undefined}
              flush
            >
              <div>
                {shipments.map((shipment, index) => (
                  <div key={shipment.id} className="sod-parcel">
                    <span className="sod-parcel-when">
                      {shipments.length === 1 ? 'Sent' : `Parcel ${index + 1}, sent`}{' '}
                      {formatOrderDate(shipment.shippedAt, timezone)}
                      {shipment.carrier ? ` with ${shipment.carrier}` : ''}
                    </span>
                    {/* Once it has actually arrived, the day it arrived on -
                        "Arranged for today between 10am and 1pm" is a plan, and
                        a plan is the wrong tense for something that has already
                        happened.

                        Only ever printed off a real timestamp from the courier:
                        `arrived` on its own can mean nothing more than the
                        booked window having gone by (see lib/order-delivery.ts),
                        and "Delivered on the 8th" is not a sentence to write
                        because a clock passed 1pm. Without one, the arrangement
                        stands as it was. */}
                    {deliveredOn.get(shipment.id) ? (
                      <span className="sod-parcel-booked">
                        Delivered on {formatDeliveredDay(deliveredOn.get(shipment.id) as Date, timezone)}
                      </span>
                    ) : deliveryById.get(shipment.id)?.day ? (
                      /* The booked delivery, in the customer's own words. The
                         day is a calendar day and stays one - see
                         lib/delivery-slot.ts for what happens to it otherwise. */
                      <span className="sod-parcel-booked">
                        Arranged for {deliveryById.get(shipment.id)?.day}
                        {deliveryById.get(shipment.id)?.window
                          ? ` ${deliveryById.get(shipment.id)?.window}`
                          : ''}
                      </span>
                    ) : null}
                    {shipment.trackingNumber && (
                      <span className="sod-dim">Tracking number: {shipment.trackingNumber}</span>
                    )}
                    <ul className="sod-parcel-items">
                      {shipment.items.map((item) => (
                        <li key={item.id}>
                          {itemsById.get(item.orderItemId)?.productName ?? 'Item'} × {item.quantity}
                        </li>
                      ))}
                    </ul>
                    {/* The carrier's own page for this parcel. Re-checked here
                        rather than trusted: the dispatch route refuses anything
                        that is not http(s), but a row written before that check
                        existed has never been past it, and this is an href in
                        front of somebody who trusts the shop. */}
                    {/* Recorded is not the same as offered. Some couriers'
                        tracking page is really the shop's own trade portal -
                        account number, pro-forma status, the supplier's
                        branding - and the courier's settings say so. Staff
                        still see the link on the order screen. */}
                    {/* What the carrier has said since: the driver's progress
                        in words, and their own history. Shown before the button
                        out to them, because it is the answer to the question
                        that button used to be the only way of asking. */}
                    {deliveryById.get(shipment.id) && (
                      <ParcelTracking delivery={deliveryById.get(shipment.id) as ParcelDelivery} />
                    )}
                    {/* And only while it is still coming. Everything that
                        button offers - a safe place, a neighbour, a different
                        day - is a change to a delivery that has already
                        happened, and the courier's own page will refuse all
                        three. The same rule the delivery questions follow. */}
                    {!deliveryById.get(shipment.id)?.arrived
                      && deliveryById.get(shipment.id)?.showTracking !== false
                      && safeTrackingUrl(shipment.trackingUrl) && (
                      <>
                        {/* The label is the courier's own setting where they
                            have one. On a courier the shop follows itself, the
                            customer has just read the timeline, the window and
                            the driver above - so a button offering to "track
                            your parcel" would send them out for what they have
                            in front of them, and bury the safe place, the
                            neighbour and the change of date that only the
                            courier can do. */}
                        <a
                          className="sod-btn sod-btn-ghost sod-track"
                          href={safeTrackingUrl(shipment.trackingUrl)}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {deliveryById.get(shipment.id)?.trackingLabel === DEFAULT_TRACKING_LABEL
                            ? `Track ${shipments.length === 1 ? 'your parcel' : `parcel ${index + 1}`}`
                            : deliveryById.get(shipment.id)?.trackingLabel}
                        </a>
                        {deliveryById.get(shipment.id)?.trackingHint && (
                          <span className="sod-dim">{deliveryById.get(shipment.id)?.trackingHint}</span>
                        )}
                      </>
                    )}
                    {/* Proof of delivery, once the courier has handed one
                        over. Our own copy of their image - see
                        lib/tracking/signature-capture.ts for why it is not
                        their link.

                        Worded for both kinds, because couriers have stopped
                        agreeing on what proof is: some still take a signature
                        on a handset, others photograph the parcel where they
                        left it. "Received by Beckley at 12:20" is true of both
                        and reads like a person wrote it; "Signed for" against a
                        photograph of a doorstep is not true of either.

                        The name and time show even where no picture came with
                        them - a courier who names who took it in has given the
                        useful half of a proof of delivery. */}
                    {(shipment.signatureUrl || shipment.signedBy) && (
                      <div className="sod-signed">
                        <p className="sod-signed-by">
                          {shipment.signedBy ? `Received by ${shipment.signedBy}` : 'Delivered'}
                          {shipment.signedAt ? ` at ${formatOrderDateTime(shipment.signedAt, timezone)}` : ''}
                        </p>
                        {shipment.signatureUrl && (
                          <>
                            {/* eslint-disable-next-line @next/next/no-img-element -- proof of
                                delivery is an arbitrary third-party image of unknown dimensions;
                                next/image wants a size it cannot be told and a loader this file
                                has no business picking. */}
                            <img
                              className="sod-signed-img"
                              src={shipment.signatureUrl}
                              alt={shipment.signedBy
                                ? `Proof of delivery, received by ${shipment.signedBy}`
                                : 'Proof of delivery'}
                              loading="lazy"
                            />
                          </>
                        )}
                      </div>
                    )}
                    {questionsFor(shipment.id) && (
                      <CourierFaqModal
                        faqs={deliveryById.get(shipment.id)?.faqs ?? []}
                        courierName={shipment.carrier?.trim() || null}
                        openInitially={faqRequested && faqShipmentId === shipment.id}
                      />
                    )}
                  </div>
                ))}
              </div>
            </OrderCard>
          )}

          {downloads.length > 0 && (
            <OrderCard title="Your downloads" flush>
              <ul className="sod-docs">
                {downloads.map((download, index) => (
                  <li key={download.id} className="sod-doc">
                    <Icon>{ICON_DOWNLOAD}</Icon>
                    <span className="sod-doc-name">
                      <a href={`/shop/downloads/${download.token}`}>
                        {downloads.length === 1 ? 'Your download' : `Download ${index + 1}`}
                      </a>
                    </span>
                    <span className="sod-doc-get" aria-hidden="true">Get it</span>
                  </li>
                ))}
              </ul>
            </OrderCard>
          )}

          <OrderCard title="Paperwork" flush>
            <OrderDocuments documents={documents} />
          </OrderCard>

          <OrderCard title="Payment">
            <p><strong>{methodName}</strong></p>
            {paymentWhen && <p className="sod-dim">{paymentWhen}</p>}
            {/* Their own reference for the order, under the money rather than in
                a card of its own. It exists so an accounts department can match
                this order to the payment it made for it, which is the same
                subject as everything above it - and a whole card holding one
                short line was the thinnest thing on the page. The rule and the
                small heading keep it from reading as another line about the
                payment method. */}
            {showReference && (
              <div className="sod-card-part">
                <p className="sod-sub">{referenceLabel}</p>
                <OrderReferencePanel
                  orderId={order.id}
                  label={referenceLabel}
                  reference={order.customerReference ?? ''}
                  editable={referenceEditable}
                />
              </div>
            )}
          </OrderCard>

          <OrderCard title="Delivery address">
            <address className="sod-lines">
              {addressLines(order.shippingAddress).map((line, i) => <span key={i}>{line}</span>)}
            </address>
          </OrderCard>

          {/* Where the invoice goes, in one card. This used to be two - a read-only
              "Billing address" beside a "Who your invoice is made out to" panel -
              which put the same address on the page twice under two headings and
              left the customer to work out which of them the paperwork obeyed.

              Always shown, including on an order billed to the delivery address:
              the invoice is made out to somewhere whether or not the shopper gave
              a second address, and a card that disappears on those orders is a
              card that looks like a missing detail. */}
          <OrderCard title="Billing address">
            {billingOffered ? (
              <OrderBillingPanel
                orderId={order.id}
                companyLabel={config.organisationLabel.trim() || 'Company name'}
                // What the invoice prints, which on an older order is not always
                // the order's own column - see orderCompanyName.
                company={orderCompanyName(order) ?? ''}
                // The address the paperwork actually prints: the billing one where
                // the order carries one, the delivery one where it does not, which
                // is exactly what buildCustomer does when the invoice is raised.
                address={order.billingAddress ?? order.shippingAddress}
                editable={customerCanEditBilling({ config, order })}
                invoiced={Boolean(invoiceRecord)}
              />
            ) : (
              // A shop that does not take corrections says the same thing without
              // the form, and reads the same address the panel would have.
              <address className="sod-lines">
                {addressLines(order.billingAddress ?? order.shippingAddress)
                  .map((line, i) => <span key={i}>{line}</span>)}
              </address>
            )}
          </OrderCard>

          {completedRefunds.length > 0 && (
            <OrderCard title="Refunds" flush>
              <ul className="sod-rows">
                {completedRefunds.map((refund) => (
                  <li key={refund.id} className="sod-rowitem">
                    <span className="sod-rowhead">
                      <span>{formatOrderDate(refund.createdAt, timezone)}</span>
                      <span className="sod-amount">{formatMoney(refund.amount, symbol)}</span>
                    </span>
                    <span className="sod-dim">
                      {refundItems
                        .filter((item) => item.refundId === refund.id)
                        .map((item) => `${itemsById.get(item.orderItemId)?.productName ?? 'Item'} × ${item.quantity}`)
                        .join(', ') || 'Order refund'}
                    </span>
                  </li>
                ))}
              </ul>
            </OrderCard>
          )}

          {decided.length > 0 && (
            <OrderCard title="Requests you have made" flush>
              <ul className="sod-rows">
                {decided.map((request) => {
                  const state = REQUEST_STATUS_DISPLAY[request.status]
                  return (
                    <li key={request.id} className="sod-rowitem">
                      <span className="sod-rowhead">
                        <strong>{REQUEST_TYPE_LABEL[request.type]}</strong>
                        <span className={badgeClass(state.tone)}>{state.label}</span>
                      </span>
                      <span className="sod-dim">
                        asked {formatOrderDate(request.createdAt, timezone)} - {reasonLabel(request.type, request.reason)}
                        {request.items.length > 0 && (
                          <>
                            {' · '}
                            {request.items
                              .map((item) => `${itemsById.get(item.orderItemId)?.productName ?? 'Item'} × ${item.quantity}`)
                              .join(', ')}
                          </>
                        )}
                      </span>
                      {request.adminNote && <span>{request.adminNote}</span>}
                    </li>
                  )
                })}
              </ul>
            </OrderCard>
          )}

          {/* Last card in the grid: it is the only thing on the page that starts
              something, so it comes after everything that merely reports. It
              pairs off with whatever card is beside it, and takes the whole row
              on its own when the count is odd - see .sod-grid. Opening it swaps
              the card for a form, which asks for the full width itself. */}
          {/* Always rendered, and it decides for itself whether it has anything
              to say - there is no longer a state where every door is shut, since
              an issue can be reported however many are already open. */}
          <OrderRequestPanel
            orderId={order.id}
            cancel={offer(detail.cancel)}
            return={offer(detail.return)}
            damage={offer(detail.damage)}
            cancelReasons={SHP_CANCEL_REASONS}
            returnReasons={SHP_RETURN_REASONS}
            damageReasons={SHP_DAMAGE_REASONS}
            lines={lines.map((line) => ({
              orderItemId: line.item.id,
              productName: line.item.productName,
              returnableQty: line.returnableQty,
              cancellableQty: line.cancellableQty,
              outstandingQty: line.outstandingQty,
              dispatchedQty: line.dispatchedQty,
              returnsPolicy: line.returnsPolicy,
              returnsNote: line.returnsNote,
            }))}
            returnBy={detail.returnBy ? formatOrderDate(detail.returnBy, timezone) : null}
            openReports={openDamageRequests.length}
            openReportInitially={reportRequested}
          />
        </div>

        {/* The offer of an account, to a guest who has just proved a postcode to
            get here. Last on the page on purpose: they came for the order, not
            for this, and they have now done by hand the very thing an account
            would have saved them - which is the best argument for one there is.
            Nothing is shown to a member, who has one. */}
        {!member && !order.memberId && (
          <GuestOrderAccountOffer config={config} customerEmail={order.customerEmail} />
        )}
      </div>
    </>
  )

  // A member's order sits inside the account, tab bar and all. A guest has no
  // account for it to sit inside, so it gets the same container on its own -
  // the width and the margins are MemberAccountShell's own, so the page does
  // not visibly change size depending on who is looking at it.
  return member ? (
    <MemberAccountShell member={member} maxWidth={880}>{body}</MemberAccountShell>
  ) : (
    <div style={{ maxWidth: 880, margin: '3rem auto', padding: '0 1.5rem' }}>{body}</div>
  )
}
