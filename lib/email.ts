import { sendEmail } from '@/lib/email/index'
import { renderEmailTemplate } from '@/lib/email/render'
import { logOrderEmail } from '@/modules/shop/lib/db/orders'
import { SHOP_TRIGGER_TO_TEMPLATE_KEY } from '@/modules/shop/lib/email-templates'
import type { ShpEmailTemplateTrigger } from '@/modules/shop/lib/types'

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
export async function sendShopEmail(
  trigger: ShpEmailTemplateTrigger,
  to: string,
  vars: Record<string, string>,
  opts?: { orderId?: string }
): Promise<void> {
  const rendered = await renderShopEmail(trigger, vars)
  if (!rendered) return
  await sendEmail({ to, subject: rendered.subject, html: rendered.html, text: rendered.text })
  if (opts?.orderId) await logOrderEmail(opts.orderId, rendered.subject, to, trigger)
}
