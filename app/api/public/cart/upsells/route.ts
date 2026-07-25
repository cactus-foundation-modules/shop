import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getProductsByIds } from '@/modules/shop/lib/db/products'
import { resolveUpsellsForProducts } from '@/modules/shop/lib/db/recommendations'
import { shopClosedResponse } from '@/modules/shop/lib/access'

const Body = z.object({
  productIds: z.array(z.string().min(1)).min(1).max(50),
})

// Upsell suggestions for a whole cart in ONE request. The cart upsell strip
// previously listed the entire catalogue (to map its localStorage product ids
// to slugs) and then called the per-product upsell endpoint once per cart line,
// serially - a multi-second waterfall for a strip of four chips. This endpoint
// takes the ids the client already holds and returns the merged, de-duplicated
// suggestions (cart products excluded) in cart order.
export async function POST(request: NextRequest) {
  const closed = await shopClosedResponse()
  if (closed) return closed

  const parsed = Body.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })

  const inCart = new Set(parsed.data.productIds)
  const cartProducts = await getProductsByIds(parsed.data.productIds)
  const active = parsed.data.productIds
    .map((id) => cartProducts.get(id))
    .filter((p): p is NonNullable<typeof p> => !!p && p.status === 'ACTIVE')

  const upsellsByProduct = await resolveUpsellsForProducts(active)

  const seen = new Map<string, { id: string; slug: string; name: string; price: string }>()
  for (const product of active) {
    for (const upsell of upsellsByProduct.get(product.id) ?? []) {
      if (inCart.has(upsell.id) || seen.has(upsell.id) || upsell.status !== 'ACTIVE') continue
      seen.set(upsell.id, { id: upsell.id, slug: upsell.slug, name: upsell.name, price: upsell.price })
    }
  }
  return NextResponse.json({ products: [...seen.values()] })
}
