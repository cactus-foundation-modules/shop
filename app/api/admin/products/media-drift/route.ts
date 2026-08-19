import { NextRequest, NextResponse } from 'next/server'
import { requireShopUser } from '@/modules/shop/lib/access'
import { findMediaDrift, refileProducts } from '@/modules/shop/lib/media/refile'

// Report and repair media filed under a category name the shop no longer uses.
//
// GET  - which listings have drifted, and by how many files. Read-only.
// POST - re-file a batch of them. Batched rather than "do the lot" because each
//        product's move is a real copy in storage: the caller walks the list a
//        page at a time so a long tidy-up reports progress instead of timing out
//        silently half way through.
export const maxDuration = 60

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
  const gate = await requireShopUser('shop.products')
  if (gate.error) return gate.error

  const body = await request.json().catch(() => null)
  const ids: unknown = body?.productIds
  if (!Array.isArray(ids) || ids.length === 0 || !ids.every((i) => typeof i === 'string')) {
    return NextResponse.json({ error: 'productIds must be a non-empty array' }, { status: 400 })
  }
  // A hard cap, not a suggestion: each id can mean dozens of blob copies, and a
  // request that runs past the function's ceiling would leave the caller unable
  // to tell what had been done.
  if (ids.length > 10) {
    return NextResponse.json({ error: 'Re-file at most 10 products per request' }, { status: 400 })
  }

  const result = await refileProducts(ids as string[])
  return NextResponse.json({ ok: true, ...result })
}
