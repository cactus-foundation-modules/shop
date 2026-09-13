import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireShopUser } from '@/modules/shop/lib/access'
import { findMediaDrift, refileProducts } from '@/modules/shop/lib/media/refile'

// Report and repair media filed under a name the shop no longer uses - a
// category's old name, or a listing's.
//
// GET  - which listings have drifted, and by how many files. Read-only.
// POST - re-file a batch of them. Batched rather than "do the lot" because each
//        product's move is a real copy in storage: the caller walks the list a
//        page at a time so a long tidy-up reports progress instead of timing out
//        silently half way through.
export const maxDuration = 60

// Stop starting new copies this long into the request, leaving the rest of the
// function's ceiling for the copy in flight and the answer. A listing with more
// files than fit is reported unfinished and picked up by the next request.
const COPY_BUDGET_MS = 40_000

// A hard cap on the batch, not a suggestion: each id can mean hundreds of blob
// copies, and a request that runs past the function's ceiling would leave the
// caller unable to tell what had been done.
const RefileBody = z.object({
  productIds: z.array(z.string().min(1)).min(1, 'productIds must be a non-empty array')
    .max(10, 'Re-file at most 10 products per request'),
})

export async function GET(request: NextRequest) {
  const gate = await requireShopUser('shop.products', { allowAccess: true })
  if (gate.error) return gate.error

  const categoryId = request.nextUrl.searchParams.get('categoryId') ?? undefined
  const drifted = await findMediaDrift(categoryId)
  return NextResponse.json({
    drifted,
    products: drifted.length,
    files: drifted.reduce((sum, d) => sum + d.fileCount, 0),
  })
}

export async function POST(request: NextRequest) {
  const until = Date.now() + COPY_BUDGET_MS
  const gate = await requireShopUser('shop.products')
  if (gate.error) return gate.error

  const parsed = RefileBody.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' }, { status: 400 })
  }

  const result = await refileProducts(parsed.data.productIds, until)
  return NextResponse.json({ ok: true, ...result })
}
