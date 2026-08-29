import { sendEmail, type EmailAttachment } from '@/lib/email/index'
import { renderEmailTemplate } from '@/lib/email/render'
import { logOrderEmail } from '@/modules/shop/lib/db/orders'
import { SHOP_TRIGGER_TO_TEMPLATE_KEY } from '@/modules/shop/lib/email-templates'
import type { ShpConfig } from '@/modules/shop/lib/config'
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
  opts?: { orderId?: string; attachments?: EmailAttachment[] }
): Promise<void> {
  const rendered = await renderShopEmail(trigger, vars)
  if (!rendered) return
  await sendEmail({
    // Names the module in the email log, and lets a site say on the shop's
    // settings tab which of its own addresses these go out as - so a customer
    // replying to their confirmation reaches the people who deal with orders
    // rather than the site's general post. Say nothing and nothing changes.
    moduleName: 'shop',
    to,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
    ...(opts?.attachments?.length ? { attachments: opts.attachments } : {}),
  })
  if (opts?.orderId) await logOrderEmail(opts.orderId, rendered.subject, to, trigger)
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
