import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireShopUser } from '@/modules/shop/lib/access'
import { updateProduct } from '@/modules/shop/lib/db/products'
import { setRelatedProducts, setAutoExcludedProducts } from '@/modules/shop/lib/db/recommendations'
import { RECOMMENDATION_MAX_EXCLUSIONS, RECOMMENDATION_MAX_PICKS, formatLimit } from '@/modules/shop/lib/admin-input-limits'

// Both lists are rewritten row by row on every save, so both have a ceiling
// (lib/admin-input-limits.ts) - far past what the picker, one product at a
// time, would ever reach.
const Body = z.object({
  mode: z.enum(['MANUAL', 'AUTOMATIC']),
  // How many the strip shows. Capped at the most a manual list may hold, which
  // is also the most an automatic one is worth fetching candidates for.
  limit: z.number().int().positive().max(RECOMMENDATION_MAX_PICKS, `Show at most ${formatLimit(RECOMMENDATION_MAX_PICKS)}.`),
  relatedIds: z.array(z.string()).max(RECOMMENDATION_MAX_PICKS, `At most ${RECOMMENDATION_MAX_PICKS} related products can be picked.`),
  excludedIds: z.array(z.string())
    .max(RECOMMENDATION_MAX_EXCLUSIONS, `At most ${formatLimit(RECOMMENDATION_MAX_EXCLUSIONS)} products can be kept out of the suggestions.`)
    .optional(),
})

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireShopUser('shop.products')
  if (gate.error) return gate.error

  const { id } = await params
  const parsed = Body.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid recommendation data' }, { status: 400 })

  await updateProduct(id, { relatedMode: parsed.data.mode, relatedLimit: parsed.data.limit })
  await setRelatedProducts(id, parsed.data.relatedIds)
  if (parsed.data.excludedIds) await setAutoExcludedProducts(id, parsed.data.excludedIds)

  return NextResponse.json({ success: true })
}
