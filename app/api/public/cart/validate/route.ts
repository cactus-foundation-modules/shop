import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { checkInMemoryRateLimit } from '@/modules/shop/lib/rate-limit'
import { getClientIp } from '@/lib/auth/rate-limit'
import { resolveCartLinesWithDeduction } from '@/modules/shop/lib/checkout'
import { orderSizeDeductionNotes } from '@/modules/shop/lib/order-size-deduction'
import { getProductMediaForProducts } from '@/modules/shop/lib/db'
import { getDefaultTaxZoneId, getTaxRateForZoneAndClass } from '@/modules/shop/lib/db/tax-shipping'
import { shopClosedResponse } from '@/modules/shop/lib/access'
import { getCartSummaryNotes } from '@/modules/shop/lib/cart-summary'
import { getShopConfigCached } from '@/modules/shop/lib/config'
import { supplierPageLinks } from '@/modules/shop/lib/supplier-links'
import { displayAmount, type PriceDisplay } from '@/modules/shop/lib/tax-display-shared'
import { CheckoutLinesSchema, checkoutLinesRefusal } from '@/modules/shop/lib/checkout-lines'

const Body = z.object({
  lines: CheckoutLinesSchema,
})

// Revalidates client localStorage cart lines against live stock/price/status
// (spec 8.1 POST /cart/validate, Q9).
export async function POST(request: NextRequest) {
  // Each call prices the whole cart against the database. The browser calls it
  // on every cart change, so the ceiling is generous - it is here to stop a
  // script hammering it, not to get in a shopper's way.
  if (!checkInMemoryRateLimit(`shop_cart_validate:${await getClientIp()}`, 120, 60_000)) {
    return NextResponse.json({ error: 'Too many requests - please wait a moment and try again.' }, { status: 429 })
  }
  const closed = await shopClosedResponse()
  if (closed) return closed

  const parsed = Body.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: checkoutLinesRefusal(parsed.error) ?? 'Invalid cart' }, { status: 400 })

  // The media query needs only the product ids the client sent, so it runs in
  // parallel with the whole line resolution instead of after it (products that
  // fail to resolve are simply never read out of the map). One query for every
  // line's product, not one per line.
  const [{ lines: resolved, orderSizeDeduction }, mediaByProduct, defaultZoneId, config] = await Promise.all([
    resolveCartLinesWithDeduction(parsed.data.lines),
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
      // What came off this unit because the basket reached its supplier's
      // order-size threshold, and what the unit cost before it did. Both on the
      // same side of tax as the figures above, because the basket strikes the
      // one through beside the other. Null on every line that lost nothing.
      orderSizeDeduction: line.orderSizeDeduction != null ? shown(line.orderSizeDeduction) : null,
      unitPriceBeforeDeduction: line.orderSizeDeduction != null ? shown(line.unitPrice + line.orderSizeDeduction) : null,
      available: line.available,
      availabilityReason: line.availabilityReason ?? null,
      isPreOrder: line.isPreOrder,
      // The minimum this line answers to, and whether it is counted across the
      // whole listing rather than against this line alone. A pooled line's
      // stepper floor is 1 (four colours are still four chairs); an unpooled
      // one stops at the minimum, which it could never satisfy by itself.
      minOrderQuantity: line.minOrderQuantity,
      minOrderPooled: line.minOrderPooled,
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
  const providerNotes = await getCartSummaryNotes(resolved.map((line) => ({
    product: line.product,
    quantity: line.quantity,
    meta: metaByKey.get(line.lineId ?? line.product.id),
  })))

  // Shop's own note about the order-size deduction is returned SEPARATELY from
  // the notes modules contribute, and that separation is the point.
  //
  // Those notes are dressed per surface by the author (cart-note-options.ts):
  // the checkout draws them as a quiet line, the cart page hides them
  // outright. Both defaults were written when a note meant a delivery estimate,
  // and neither suits this one - a muted aside undersells "add £113 more",
  // which is an instruction rather than a fact, and hiding it on the cart
  // page hides the one sentence that exists to move the order value, on exactly
  // the page where a shopper decides whether to add anything.
  //
  // So it travels on its own and every basket draws it itself, always, in the
  // same look the product page gives the same sentence. Nothing about the
  // author's note styling changes for anyone.
  //
  // The figures are stored-side, like the thresholds and amounts they come from,
  // so the sentence quotes what the owner typed rather than a tax conversion of
  // it. Deliberate: "orders of £350 or more" is the supplier's rule, not a price.
  //
  // The supplier's name in it links to their page where the shop publishes one,
  // looked up only for the suppliers that actually have a note to print.
  const noteStates = config.orderSizeDeductionShowInBasket ? orderSizeDeduction.filter((s) => s.saving > 0) : []
  const supplierLinks = noteStates.length > 0
    ? await supplierPageLinks(config, noteStates.map((s) => s.supplier))
    : new Map<string, string>()
  const deductionNotes = orderSizeDeductionNotes(noteStates, config.currencySymbol, (name) => supplierLinks.get(name) ?? null)

  return NextResponse.json({ lines, notes: providerNotes, deductionNotes })
}
