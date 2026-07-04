import { sendEmail } from '@/lib/email/index'
import { getEmailTemplate } from '@/modules/shop/lib/db/email-templates'
import { logOrderEmail } from '@/modules/shop/lib/db/orders'
import type { ShpEmailTemplateTrigger } from '@/modules/shop/lib/types'

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

// {{#if flag}}...{{/if}} - the one conditional block the spec needs (ORDER_CONFIRMED's
// pre-order notice, addendum B.6). `flag` must be a key in vars set to the literal
// string 'true' for the block to render; anything else strips it.
function applyConditionals(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{#if (\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g, (_, key: string, inner: string) => {
    return vars[key] === 'true' ? inner : ''
  })
}

function interpolate(template: string, vars: Record<string, string>, escape: boolean): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    const value = vars[key]
    if (value === undefined) return ''
    return escape ? escapeHtml(value) : value
  })
}

export type RenderedShopEmail = { subject: string; html: string; text: string }

// DB row (seeded by the migration, admin-editable) else falls back to a plain
// default - templates should always exist post-migration, but a missing row
// must never take checkout down.
export async function renderShopEmail(trigger: ShpEmailTemplateTrigger, vars: Record<string, string>): Promise<RenderedShopEmail | null> {
  const template = await getEmailTemplate(trigger)
  if (!template || !template.isActive) return null

  const subjectWithConditionals = applyConditionals(template.subject, vars)
  const bodyWithConditionals = applyConditionals(template.bodyHtml, vars)
  const bodyTextTemplate = bodyWithConditionals.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()

  return {
    subject: interpolate(subjectWithConditionals, vars, false),
    html: interpolate(bodyWithConditionals, vars, true),
    text: interpolate(bodyTextTemplate, vars, false),
  }
}

// Sends a rendered shp_email_templates trigger to an arbitrary address. When
// orderId is given, every customer-facing send is logged to shp_order_emails
// (spec's order email log / Communications tab).
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
