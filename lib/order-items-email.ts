import { escapeHtml } from '@/lib/email/blocks'
import { getSiteUrl } from '@/lib/config/env'
import { getProductMediaForProducts, getProductSlugsByIds } from '@/modules/shop/lib/db/products'
import { formatMoney } from '@/modules/shop/lib/money'
import { productUrl, type ProductUrlStyle } from '@/modules/shop/lib/product-url'
import type { ShpOrderItem, ShpProductMedia } from '@/modules/shop/lib/types'
import type { ShpConfig } from '@/modules/shop/lib/config'

// What an order's lines look like in an email.
//
// They used to be one plain-text string: `name xN - £total`, with the
// personalisation indented underneath, newline-joined and dropped into the
// template as an ordinary merge value. That reads correctly in the text part
// and nowhere else - HTML collapses every one of those newlines to a space, so
// a five-line order arrived in the inbox as one unbroken paragraph running from
// the first chair to the last desk, prices and delivery notes and all. It was
// legible only to somebody who already knew what it said.
//
// So the lines are assembled here as a table instead, with the product's
// photograph beside each one. The value goes into the template as a rawTag
// (see lib/email-templates.ts): everything below escapes what it prints, and
// nothing here is passed through from a form without going through escapeHtml.
//
// Email is not the web, so: tables rather than flex, every rule inline, no CSS
// custom properties, and fixed pixel widths. The same constraints core's own
// blocks are written under, and the reasoning is in lib/email/blocks.ts.

const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif"
const TEXT = '#333333'
const MUTED = '#666666'
const RULE = '#e5e5e5'
const THUMB = 64

/** One row of the table. `price` is optional: a dispatch note lists what is in
 *  the parcel, and what a thing cost is not the customer's question then. */
export type OrderEmailLine = {
  name: string
  quantity: number
  price?: string
  imageUrl?: string | null
  /** Absolute link to the page for this exact thing - the line's own product,
   *  which for a variation is the child row whose slug the shop publishes. Null
   *  where there is nothing safe to point at. */
  url?: string | null
  /** Personalisation, options, delivery notes - whatever the line carries. */
  extras?: Array<{ label: string; value: string }>
}

/**
 * A media url made absolute, or null where it cannot safely be one.
 *
 * An inbox has no origin to resolve `/media/…` against, so a site-relative url
 * that reaches an `<img src>` unqualified is a broken picture in every mail
 * client there is. Anything that is neither http(s) nor site-relative is
 * dropped rather than emitted - the same rule core applies to hrefs, and for
 * the same reason.
 */
export function absoluteImageUrl(url: string | null | undefined, siteUrl: string): string | null {
  const value = (url ?? '').trim()
  if (!value) return null
  if (/^https?:\/\//i.test(value)) return value
  if (!value.startsWith('/')) return null
  const base = siteUrl.replace(/\/+$/, '')
  return base ? `${base}${value}` : null
}

/**
 * The absolute address of a line's own product page, or null where there is
 * nothing to point at.
 *
 * The slug is the LINE'S OWN product, which for a variation is the
 * catalogue-hidden child row - the same address the cart builds and a shopper
 * shares. Shop's product page hands an unshowable slug to the
 * `shop.product-page-resolver` point (see lib/product-page-resolver.ts), which
 * is how shop-variations opens the parent's page with that variation already
 * chosen. So one plain link covers "the exact product" and "the exact
 * variation" without this module knowing how variations are wired, which it
 * must not.
 *
 * An inbox has no origin, so a link with no site URL to hang off is dropped
 * rather than sent as a relative path that resolves to nothing.
 */
export function productEmailUrl(
  slug: string | null | undefined,
  siteUrl: string,
  style: ProductUrlStyle,
): string | null {
  const value = (slug ?? '').trim()
  const base = siteUrl.trim().replace(/\/+$/, '')
  if (!value || !base) return null
  return productUrl(base, value, style)
}

/**
 * The order's lines with a photograph against each, ready for the table.
 *
 * Two bulk queries at most, whatever the size of the order - the picture is a
 * nicety, and a per-line round trip inside a payment webhook is not a price
 * worth paying for one.
 *
 * The picture is the line's OWN product's, which for a variation is the child
 * product carrying that colour's photographs. A variation photographed only on
 * its parent therefore shows no thumbnail here, exactly as it shows none on the
 * thank-you page and the customer's own order page: those read the same media,
 * and an email that disagreed with the page it links to would be worse than a
 * blank square. Reading the parent's would mean this module knowing how another
 * one links children to parents, which it must not.
 */
export async function orderEmailLines(
  items: ShpOrderItem[],
  config: Pick<ShpConfig, 'currencySymbol' | 'productUrlStyle'>,
): Promise<OrderEmailLine[]> {
  const siteUrl = getSiteUrl()
  const productIds = items.map((i) => i.productId).filter((id): id is string => !!id)
  // A product deleted since the order simply has no picture, rather than taking
  // the email down with it.
  // A picture is a nicety and the email is not. A media read that will not
  // answer costs the thumbnails and nothing else.
  const [mediaByProduct, slugByProduct] = await Promise.all([
    productIds.length > 0
      ? getProductMediaForProducts(productIds).catch((error) => {
          console.error('[shop] could not read product images for an order email', error)
          return new Map<string, ShpProductMedia[]>()
        })
      : Promise.resolve(new Map<string, ShpProductMedia[]>()),
    // Same treatment as the pictures: a link is a nicety, and a read that will
    // not answer costs the links and leaves the names as plain text.
    productIds.length > 0
      ? getProductSlugsByIds(productIds).catch((error) => {
          console.error('[shop] could not read product slugs for an order email', error)
          return new Map<string, string>()
        })
      : Promise.resolve(new Map<string, string>()),
  ])

  return items.map((item) => {
    const media = item.productId ? mediaByProduct.get(item.productId) ?? [] : []
    const image = media.find((m) => m.type === 'IMAGE' && m.isPrimary) ?? media.find((m) => m.type === 'IMAGE')
    return {
      name: item.productName,
      quantity: item.quantity,
      price: formatMoney(item.total, config.currencySymbol),
      imageUrl: absoluteImageUrl(image?.url, siteUrl),
      url: productEmailUrl(item.productId ? slugByProduct.get(item.productId) : null, siteUrl, config.productUrlStyle),
      extras: item.lineMeta?.fields?.map((f) => ({ label: f.label, value: f.value })) ?? [],
    }
  })
}

/** The name, linked to the product where there is a link to give. Underlined
 *  rather than recoloured: the shop's own palette is not available in here (no
 *  custom properties in an email), and a hardcoded brand blue would clash with
 *  every wrapper that is not blue. */
function linked(html: string, url: string | null | undefined): string {
  const href = (url ?? '').trim()
  if (!href) return html
  return `<a href="${escapeHtml(href)}" style="color:${TEXT};text-decoration:underline;">${html}</a>`
}

function thumbCell(line: OrderEmailLine, style: string): string {
  const src = line.imageUrl
  if (!src) {
    // Kept as an empty cell rather than dropped, so a line with no photograph
    // does not shunt its name under the column of pictures above it.
    return `<td width="${THUMB}" style="${style}width:${THUMB}px;">&nbsp;</td>`
  }
  // alt is deliberately empty: the name is in the cell beside it, and a client
  // with images switched off would otherwise print it twice.
  const img =
    `<img src="${escapeHtml(src)}" width="${THUMB}" height="${THUMB}" alt="" ` +
    `style="display:block;width:${THUMB}px;height:${THUMB}px;border:1px solid ${RULE};border-radius:4px;object-fit:cover;" />`
  return (
    `<td width="${THUMB}" style="${style}width:${THUMB}px;">` +
    // The photograph goes to the same place the name does: it is the thing
    // people click in an order email, and a picture that does nothing when the
    // words beside it are a link reads as broken.
    linked(img, line.url) +
    `</td>`
  )
}

/**
 * The lines as an email-safe table.
 *
 * Columns earn their place: the photographs appear only when at least one line
 * has one, and the price column only when the list is a priced one. A dispatch
 * note where nothing has been photographed is then a plain two-column list of
 * what is in the box, which is all it ever needed to be.
 *
 * Returns '' for no lines at all, so a template printing it prints nothing.
 */
export function renderOrderItemsTable(lines: OrderEmailLine[]): string {
  if (lines.length === 0) return ''
  const withImages = lines.some((l) => l.imageUrl)
  const withPrices = lines.some((l) => l.price)

  const base = `font-family:${FONT};font-size:15px;line-height:1.45;color:${TEXT};`
  const headStyle = `${base}font-size:12px;letter-spacing:0.04em;text-transform:uppercase;color:${MUTED};padding:0 0 8px;border-bottom:1px solid ${RULE};`

  const head =
    '<tr>' +
    (withImages ? `<td width="${THUMB}" style="${headStyle}width:${THUMB}px;">&nbsp;</td>` : '') +
    `<td style="${headStyle}${withImages ? 'padding-left:12px;' : ''}">Item</td>` +
    `<td align="right" style="${headStyle}padding-left:12px;">Qty</td>` +
    (withPrices ? `<td align="right" style="${headStyle}padding-left:12px;">Price</td>` : '') +
    '</tr>'

  const rows = lines.map((line, index) => {
    const last = index === lines.length - 1
    // The rule goes on the cells, not the row: a border on <tr> is one of the
    // things Outlook simply does not draw.
    const cell = `${base}padding:12px 0;vertical-align:top;${last ? '' : `border-bottom:1px solid ${RULE};`}`
    const extras = (line.extras ?? [])
      .filter((f) => f.label || f.value)
      .map((f) => `<span style="color:${MUTED};font-size:13px;">${escapeHtml(f.label)}: ${escapeHtml(f.value)}</span>`)
      .join('<br />')

    return (
      '<tr>' +
      (withImages ? thumbCell(line, cell) : '') +
      `<td style="${cell}${withImages ? 'padding-left:12px;' : ''}">` +
      `<strong>${linked(escapeHtml(line.name), line.url)}</strong>` +
      (extras ? `<br />${extras}` : '') +
      '</td>' +
      `<td align="right" style="${cell}padding-left:12px;white-space:nowrap;">${escapeHtml(String(line.quantity))}</td>` +
      (withPrices
        ? `<td align="right" style="${cell}padding-left:12px;white-space:nowrap;">${escapeHtml(line.price ?? '')}</td>`
        : '') +
      '</tr>'
    )
  })

  return (
    '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" ' +
    'style="border-collapse:collapse;width:100%;margin:0 0 16px;">' +
    head +
    rows.join('') +
    '</table>'
  )
}

/** The two in one go, which is what every caller with an order actually wants. */
export async function renderOrderItemsEmailTable(
  items: ShpOrderItem[],
  config: Pick<ShpConfig, 'currencySymbol' | 'productUrlStyle'>,
): Promise<string> {
  return renderOrderItemsTable(await orderEmailLines(items, config))
}
