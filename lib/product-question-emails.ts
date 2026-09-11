import { escapeHtml } from '@/lib/email/blocks'
import { resolveBranding } from '@/lib/config/branding'
import { getAdminPathCached } from '@/lib/config/site'
import { getSiteUrlOrNull, isEmailConfigured } from '@/lib/config/env'
import { sendEmail } from '@/lib/email/index'
import { renderEmailTemplate } from '@/lib/email/render'
import { getShopConfigCached } from '@/modules/shop/lib/config'
import { productUrl } from '@/modules/shop/lib/product-url'

// The two emails "Ask a question" sends: the alert to the shop when one lands,
// and the answer to the shopper when one is written. The wording, the on/off
// switch and the design wrapped around them live with every other email on the
// site, in core's Settings > Emails; this file only works out the merge values.
// Defaults are in lib/email-templates.ts.

/** What somebody typed, safe to hand over as a rawTag: escaped, with the line
 *  breaks they put in kept as line breaks. Core escapes ordinary merge values,
 *  which would turn the <br /> into visible text - so it is done here instead,
 *  and the tag is declared raw. */
function typedText(value: string): string {
  return escapeHtml(value).replace(/\r?\n/g, '<br />')
}

/**
 * Tells the shop a question has arrived. Only ever called with the address an
 * owner typed into Shop settings, and never on a shop that left it blank.
 *
 * Every failure is swallowed by the caller: a question that saved is saved, and
 * an alert that could not go out must not turn the shopper's question into an
 * error they are asked to retry.
 */
export async function sendProductQuestionNotice(params: {
  to: string
  productName: string
  productSlug: string
  askerName: string | null
  askerEmail: string
  question: string
}): Promise<void> {
  if (!isEmailConfigured()) return

  const [branding, config, adminPath] = await Promise.all([
    resolveBranding(),
    getShopConfigCached(),
    getAdminPathCached(),
  ])
  const site = getSiteUrlOrNull()
  const adminUrl = site && adminPath ? `${site}/${adminPath}/m/shop/questions` : ''

  const rendered = await renderEmailTemplate('shop.product-question-received', {
    shopName: branding.name,
    productName: params.productName,
    productUrl: site ? productUrl(site, params.productSlug, config.productUrlStyle) : '',
    // "Somebody" rather than a blank: the name is optional on the form, and
    // "() has asked a question" reads like a bug.
    askerName: params.askerName?.trim() || 'Somebody',
    askerEmail: params.askerEmail,
    questionBody: typedText(params.question),
    adminUrl,
    hasAdminUrl: adminUrl ? 'true' : 'false',
  })
  if (!rendered) return

  await sendEmail({ to: params.to, subject: rendered.subject, html: rendered.html, text: rendered.text })
}

/**
 * Sends the answer to whoever asked.
 *
 * Throws on failure rather than swallowing, and that is the whole point: the
 * route sends BEFORE it records, so a send that fails leaves the question
 * sitting in the queue as though nobody had touched it. The other way round
 * leaves a question marked answered that the customer never heard about, which
 * is the one failure nobody at the shop would ever notice.
 */
export async function sendProductQuestionAnswer(params: {
  to: string
  askerName: string | null
  productName: string
  productSlug: string
  question: string
  answer: string
}): Promise<void> {
  if (!isEmailConfigured()) {
    throw new Error('This site has no email provider configured, so the answer cannot be sent.')
  }

  const [branding, config] = await Promise.all([resolveBranding(), getShopConfigCached()])
  const site = getSiteUrlOrNull()
  const link = site ? productUrl(site, params.productSlug, config.productUrlStyle) : ''

  const rendered = await renderEmailTemplate('shop.product-question-answered', {
    shopName: branding.name,
    productName: params.productName,
    productUrl: link,
    hasProductUrl: link ? 'true' : 'false',
    // "there" is the greeting for the ones who did not leave a name. Their
    // first name only where they did: "Hi Margaret Thatcher-Smith," is a
    // circular from a bank, not a reply from a shop.
    askerName: params.askerName?.trim().split(/\s+/)[0] || 'there',
    questionBody: typedText(params.question),
    answerBody: typedText(params.answer),
  })
  // A template core cannot render is one an owner has switched OFF. Same
  // treatment as a failed send: the caller must not record an answer that
  // nobody received.
  if (!rendered) {
    throw new Error('The "Product question answered" email is switched off, so the answer cannot be sent.')
  }

  await sendEmail({ to: params.to, subject: rendered.subject, html: rendered.html, text: rendered.text })
}
