import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { resolveCartLines } from '@/modules/shop/lib/checkout'
import { getProductMediaForProducts } from '@/modules/shop/lib/db'
import { shopClosedResponse } from '@/modules/shop/lib/access'
import { getCartSummaryNotes } from '@/modules/shop/lib/cart-summary'

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
  const [resolved, mediaByProduct] = await Promise.all([
    resolveCartLines(parsed.data.lines),
    getProductMediaForProducts(parsed.data.lines.map((line) => line.productId)),
  ])
  const lines = resolved.map((line) => {
    const media = mediaByProduct.get(line.product.id) ?? []
    const primary = media.find((m) => m.isPrimary) ?? media[0]
    return {
      productId: line.product.id,
      // Echo the client line key so personalised lines (same product, different
      // options) can be matched back one-to-one instead of merging by productId.
      lineId: line.lineId ?? null,
      name: line.product.name,
      slug: line.product.slug,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      lineSubtotal: line.lineSubtotal,
      available: line.available,
      availabilityReason: line.availabilityReason ?? null,
      isPreOrder: line.isPreOrder,
      preOrderDispatchDate: line.product.preOrderDispatchDate,
      imageUrl: primary?.url ?? null,
      // Normalised personalisation for display (null for a plain line).
      lineMeta: line.lineMeta,
      // Optional per-line picker a resolver offered (e.g. a delivery tier).
      control: line.control ?? null,
      // Optional cart-display retitle (e.g. a variant's base name + options).
      displayTitle: line.displayTitle ?? null,
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
