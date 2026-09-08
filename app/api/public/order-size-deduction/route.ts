import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getProductById } from '@/modules/shop/lib/db/products'
import { getDeductionRules } from '@/modules/shop/lib/db/suppliers'
import { getShopConfigCached } from '@/modules/shop/lib/config'
import { makeDisplayAdjuster, resolveTaxDisplay } from '@/modules/shop/lib/tax-display'
import { orderSizeDeductionView } from '@/modules/shop/lib/order-size-deduction-view'
import { shopClosedResponse } from '@/modules/shop/lib/access'

// The order-size deduction line for ONE product, worked out on the server.
//
// Asked by the product page's client island once the shopper settles on a
// combination: the page was rendered against the listing, and on a shop selling
// variations the listing's own row is very nearly never the thing being bought
// (see components/public/OrderSizeDeductionClient.tsx).
//
// It returns the FINISHED sentence, not the figures behind it, composed by the
// same orderSizeDeductionView the page used - so the wording cannot drift
// between the two paths, and no arithmetic about the shop's prices is handed to
// a browser. Tax conversion is applied here for the same reason the cart's
// validate applies it: the shop decides which side of tax it prints on, once.
//
// Nothing here is per-shopper: the answer depends on the product and the shop's
// settings and nothing else, so it carries a short shared-cache lifetime and a
// burst is answered at the edge.
const Query = z.object({ productId: z.string().min(1).max(200) })

export async function GET(request: NextRequest) {
  const closed = await shopClosedResponse()
  if (closed) return closed

  const parsed = Query.safeParse({ productId: request.nextUrl.searchParams.get('productId') })
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })

  const config = await getShopConfigCached()
  // Switched off: answer honestly and cheaply rather than 404ing, so a page that
  // was rendered a moment before the owner turned it off simply stops saying
  // anything.
  if (!config.orderSizeDeductionEnabled) return line(null)

  const product = await getProductById(parsed.data.productId)
  // A hidden variation child is exactly what this is asked about, so
  // catalogue_hidden is deliberately NOT a filter here. An inactive product is:
  // nothing that cannot be bought should be advertising a price at all.
  if (!product || product.status !== 'ACTIVE' || !product.supplier) return line(null)

  const rules = await getDeductionRules([product.supplier])
  const rule = rules[0] ?? null
  if (!rule) return line(null)

  const taxDisplay = await resolveTaxDisplay()
  return line(
    orderSizeDeductionView({
      product,
      rule,
      enabledPriceTypes: config.enabledPriceTypes,
      adjust: makeDisplayAdjuster(taxDisplay, product.taxClassId),
      currencySymbol: config.currencySymbol,
      // A definite combination, so the definite wording - this is the whole
      // point of the round trip.
      someOptionsOnly: false,
    }),
  )
}

function line(view: unknown) {
  return NextResponse.json(
    { line: view ?? null },
    { headers: { 'Cache-Control': 'public, s-maxage=15, stale-while-revalidate=30' } },
  )
}
