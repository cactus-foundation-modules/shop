import { sendEmail, type EmailAttachment } from '@/lib/email/index'
import { renderEmailTemplate } from '@/lib/email/render'
import { logOrderEmail, type FailedOrderEmail } from '@/modules/shop/lib/db/orders'
import { dropReplacedEmails, noteFailedOrderEmail, resendHeldEmail, threadKeyFor } from '@/modules/shop/lib/order-email-retry'
import { SHOP_TRIGGER_TO_TEMPLATE_KEY } from '@/modules/shop/lib/email-templates'
import type { ShpConfig } from '@/modules/shop/lib/config'
import { orderTrackingUrl } from '@/modules/shop/lib/order-tracking'
import { reportIssueUrl } from '@/modules/shop/lib/order-requests'
import type { ShpEmailTemplateTrigger, ShpOrder } from '@/modules/shop/lib/types'

// The shop's emails are registered with core (see lib/email-templates.ts and
// the manifest's `emailTemplates` entry), so the wording, the on/off switch and
// the wrapper design all come from one place - Settings > Emails - alongside
// every other email the site sends. The shop's own template table and settings
// tab are gone.
//
// The trigger names are unchanged. They appear at every call site and in the
// order email log, and renaming them would have bought nothing.

export type RenderedShopEmail = { subject: string; html: string; text: string }

/** Null means the owner has switched this email off, so the caller should
 * quietly not send. An unknown trigger is a programming error and throws. */
export async function renderShopEmail(trigger: ShpEmailTemplateTrigger, vars: Record<string, string>): Promise<RenderedShopEmail | null> {
  const key = SHOP_TRIGGER_TO_TEMPLATE_KEY[trigger]
  if (!key) throw new Error(`Unknown shop email trigger: ${trigger}`)
  return renderEmailTemplate(key, vars)
}

// Sends a shop email to an arbitrary address. When orderId is given, every
// customer-facing send is logged to shp_order_emails (spec's order email log /
// Communications tab).
//
// `attachments` are files travelling with the message - the proforma on the "how
// to pay" email is the first of them. Passed straight through to core, which
// does the base64 for whichever transport the site is on and drops anything too
// big to send rather than losing the email with it.
export async function sendShopEmail(
  trigger: ShpEmailTemplateTrigger,
  to: string,
  vars: Record<string, string>,
  opts?: { orderId?: string; attachments?: EmailAttachment[]; shipmentId?: string; toldWindow?: string }
): Promise<void> {
  const rendered = await renderShopEmail(trigger, vars)
  if (!rendered) return
  // Anything still retrying about the same parcel is old news once this goes
  // (lib/order-email-retry.ts) - dropped before the send, so it cannot follow
  // this one into the customer's inbox, whether or not this one goes first time.
  if (opts?.orderId && opts.shipmentId) await dropReplacedEmails(opts.orderId, opts.shipmentId, trigger)
  try {
    await sendEmail({
      // Names the module in the email log, and lets a site say on the shop's
      // settings tab which of its own addresses these go out as - so a customer
      // replying to their confirmation reaches the people who deal with orders
      // rather than the site's general post. Say nothing and nothing changes.
      moduleName: 'shop',
      ...threadKeyFor(trigger, opts?.orderId),
      to,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      ...(opts?.attachments?.length ? { attachments: opts.attachments } : {}),
    })
  } catch (err) {
    // The callers carry on regardless - a status change or a refund is not
    // undone because the email about it failed - so without this the order's
    // history simply showed nothing sent, which reads the same as "never meant
    // to be sent". A system note puts the failure on the order's timeline where
    // staff look, and carries what a Resend click needs to try it again exactly
    // as written (lib/db/orders.ts, migration 067). It also starts the
    // automatic retry (migration 076). Best-effort, and the send's own error is
    // still what the caller gets.
    if (opts?.orderId) {
      await noteFailedOrderEmail(opts.orderId, failedEmailFor(trigger, to, rendered, opts), err)
    }
    throw err
  }
  if (opts?.orderId) await logOrderEmail(opts.orderId, rendered.subject, to, trigger)
}

/** What a failed send keeps so it can be sent again exactly as written. */
function failedEmailFor(
  trigger: ShpEmailTemplateTrigger,
  to: string,
  rendered: RenderedShopEmail,
  opts: { attachments?: EmailAttachment[]; shipmentId?: string; toldWindow?: string },
): FailedOrderEmail {
  return {
    trigger: String(trigger),
    to,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
    ...(opts.attachments?.length ? {
      attachments: opts.attachments.map((a) => ({
        filename: a.filename,
        contentType: a.contentType ?? 'application/pdf',
        contentBase64: Buffer.from(a.content).toString('base64'),
      })),
    } : {}),
    ...(opts.shipmentId ? { shipmentId: opts.shipmentId } : {}),
    ...(opts.toldWindow ? { toldWindow: opts.toldWindow } : {}),
  }
}

// Replays one failed send exactly as it was rendered the first time - not
// rebuilt from the order's current state, which for some of what this shop
// emails (a refund amount, a charge outcome, a specific failed delivery
// attempt) may since have moved on to a different figure than what was
// actually meant to go out. The note is where that rendered content lives
// (migration 067); this is the only way back to it, so a note id from a
// different order is refused rather than silently finding nothing.
//
// The automatic retry sends from the same note in the same way; whichever of
// them holds the note sends it, and the other stands back
// (lib/order-email-retry.ts).
export async function resendFailedOrderEmail(orderId: string, noteId: string): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  return resendHeldEmail(orderId, noteId)
}

// The customer's own reference for an order, as the three merge values every
// order email wants: the number, the shop's own wording for it, and the flag the
// `{{#if}}` block is gated on.
//
// One helper rather than the same three lines at four call sites, because the
// flag is the easy one to forget - a template with the value but not the flag
// prints nothing at all, and nobody notices until a customer asks why their
// purchase order number is not on the confirmation.
export function customerReferenceVars(
  order: Pick<ShpOrder, 'customerReference'>,
  config: Pick<ShpConfig, 'customerReferenceLabel'>,
): Record<string, string> {
  const reference = order.customerReference?.trim() ?? ''
  return {
    customerReference: reference,
    customerReferenceLabel: config.customerReferenceLabel.trim() || 'Purchase order number',
    hasCustomerReference: reference ? 'true' : 'false',
  }
}

/**
 * "Keep track of your order at ..." - the link and the flag its {{#if}} block
 * is gated on.
 *
 * Almost every order email gets these without asking, because
 * notifyOrderCustomer adds them to everything it sends. This is for the two
 * that do not go through it: the credit note and the reissued invoice, which
 * are addressed to whoever the paperwork is made out to rather than to the
 * order's own notification channels, and so send through sendShopEmail direct.
 */
export function orderTrackingVars(
  order: Pick<ShpOrder, 'orderNumber'>,
  config: Pick<ShpConfig, 'guestOrderTrackingEnabled' | 'orderTrackingRootSlug' | 'damageReportsEnabled'>,
): Record<string, string> {
  const url = orderTrackingUrl(order.orderNumber, config)
  return { ...orderUrlVars(url, config) }
}

/**
 * The order link and the issue-report link, as the four merge values every
 * order email wants, from one url.
 *
 * The report link is the same address with ?report=1 on it, and it is offered
 * only where the shop actually takes reports: a link that lands on an order page
 * with no button on it is worse than no link, because the customer has already
 * been told it is the way to tell us.
 */
export function orderUrlVars(
  url: string,
  config: Pick<ShpConfig, 'damageReportsEnabled'>,
): Record<string, string> {
  const report = config.damageReportsEnabled ? reportIssueUrl(url) : ''
  return {
    orderUrl: url,
    hasOrderUrl: url ? 'true' : 'false',
    reportIssueUrl: report,
    hasReportIssueUrl: report ? 'true' : 'false',
  }
}
