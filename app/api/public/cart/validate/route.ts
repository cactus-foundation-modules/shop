import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { resolveCartLines } from '@/modules/shop/lib/checkout'
import { getProductMediaForProducts } from '@/modules/shop/lib/db'
import { getDefaultTaxZoneId, getTaxRateForZoneAndClass } from '@/modules/shop/lib/db/tax-shipping'
import { shopClosedResponse } from '@/modules/shop/lib/access'
import { getCartSummaryNotes } from '@/modules/shop/lib/cart-summary'
import { getShopConfigCached } from '@/modules/shop/lib/config'
import { displayAmount, type PriceDisplay } from '@/modules/shop/lib/tax-display-shared'

const Body = z.object({
  lines: z.array(z.object({ productId: z.string(), quantity: z.number().int().min(1), lineId: z.string().optional(), meta: z.record(z.unknown()).optional() })),
})

// Revalidates client localStorage cart lines against live stock/price/status
// (spec 8.1 POST /cart/validate, Q9).
export async function POST(request: NextRequest) {
  const closed = await shopClosedResponse()
  if (closed) return closed

  const parsed = Body.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: 'Invalid cart' }, { status: 400 })

  // The media query needs only the product ids the client sent, so it runs in
  // parallel with the whole line resolution instead of after it (products that
  // fail to resolve are simply never read out of the map). One query for every
  // line's product, not one per line.
  const [resolved, mediaByProduct, defaultZoneId, config] = await Promise.all([
    resolveCartLines(parsed.data.lines),
    getProductMediaForProducts(parsed.data.lines.map((line) => line.productId)),
    // The cart quotes tax before an address exists, so it prices against the
    // shop's default zone (see getDefaultTaxZoneId). The checkout still resolves
    // the real zone from the delivery postcode and recomputes every figure - the
    // cart's tax line is a display estimate, never what is charged.
    getDefaultTaxZoneId(),
    getShopConfigCached(),
  ])

  // Every figure this route returns is display-only - the checkout re-resolves
  // the lot from the products before a card is touched - so the conversion to
  // whichever side of tax the shop prints on happens here, once, rather than in
  // each of the three baskets that render the response. See tax-display-shared.
  const display: PriceDisplay = {
    mode: config.priceDisplayTax,
    storedIncludesTax: config.taxMode === 'INCLUSIVE',
    suffix: config.priceDisplayTaxSuffix.trim(),
  }

  // One rate lookup per distinct tax class in the cart, not per line: a cart of
  // twelve chairs on the same class would otherwise fire twelve identical
  // queries. Rates are keyed by class id ('' standing in for "no class", which
  // is always zero-rated).
  const taxRateByClass = new Map<string, number>()
  if (defaultZoneId) {
    const classIds = [...new Set(resolved.map((line) => line.product.taxClassId ?? ''))]
    await Promise.all(classIds.map(async (classId) => {
      taxRateByClass.set(classId, classId ? await getTaxRateForZoneAndClass(defaultZoneId, classId) : 0)
    }))
  }

  const lines = resolved.map((line) => {
    const media = mediaByProduct.get(line.product.id) ?? []
    const primary = media.find((m) => m.isPrimary) ?? media[0]
    const taxRate = taxRateByClass.get(line.product.taxClassId ?? '') ?? 0
    const shown = (amount: number) => displayAmount(amount, display, taxRate)
    // A picker's own price adjustments move the line price in the browser the
    // instant a shopper switches option, so they have to be on the same side of
    // tax as the line they move. The option LABELS are the resolver's own
    // already-formatted wording and are passed through untouched - shop never
    // re-words them (see CartLineControl) - so a module that prices options
    // formats them to match the shop's setting itself.
    const control = line.control
      ? {
          ...line.control,
          options: line.control.options.map((o) => (
            o.priceAdjust == null ? o : { ...o, priceAdjust: shown(o.priceAdjust) }
          )),
        }
      : null
    return {
      productId: line.product.id,
      // Echo the client line key so personalised lines (same product, different
      // options) can be matched back one-to-one instead of merging by productId.
      lineId: line.lineId ?? null,
      name: line.product.name,
      slug: line.product.slug,
      quantity: line.quantity,
      unitPrice: shown(line.unitPrice),
      lineSubtotal: shown(line.lineSubtotal),
      available: line.available,
      availabilityReason: line.availabilityReason ?? null,
      isPreOrder: line.isPreOrder,
      preOrderDispatchDate: line.product.preOrderDispatchDate,
      imageUrl: primary?.url ?? null,
      // Normalised personalisation for display (null for a plain line).
      lineMeta: line.lineMeta,
      // Optional per-line picker a resolver offered (e.g. a delivery tier).
      control,
      // Optional cart-display retitle (e.g. a variant's base name + options).
      displayTitle: line.displayTitle ?? null,
      // Which basket group the line belongs to, when a resolver declared one -
      // the cart sorts attachments under their main and indents them from this.
      group: line.group ?? null,
      // The slice of this line's money a resolver attributes to a named charge
      // (a delivery service) rather than to the goods, so the cart can show it
      // on a line of its own instead of burying it in the subtotal.
      charges: line.charges ? line.charges.map((c) => ({ label: c.label, amount: shown(c.amount) })) : null,
      // This line's tax rate in the shop's default zone, as a fraction. The cart
      // does the arithmetic client-side so the figure moves the instant a
      // shopper changes a quantity or a delivery service, rather than waiting on
      // the next round-trip.
      taxRate,
    }
  })

  // Whole-basket notes, after the lines: a provider reads the request-scoped
  // caches the line resolution has just warmed, so this is arithmetic rather
  // than another round of queries. The raw meta is matched back by line key -
  // it carries the shopper's own per-line choices, which the resolved line
  // (deliberately) normalises away.
  const metaByKey = new Map(parsed.data.lines.map((line) => [line.lineId ?? line.productId, line.meta]))
  const notes = await getCartSummaryNotes(resolved.map((line) => ({
    product: line.product,
    quantity: line.quantity,
    meta: metaByKey.get(line.lineId ?? line.product.id),
  })))

  return NextResponse.json({ lines, notes })
}
