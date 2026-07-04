import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireShopUser } from '@/modules/shop/lib/access'
import { updateReviewStatus, deleteReview, getReviewById } from '@/modules/shop/lib/db/reviews'
import { recomputeProductRating } from '@/modules/shop/lib/db/products'

const Body = z.object({ status: z.enum(['PENDING', 'APPROVED', 'REJECTED']) })

// Approve/reject recomputes the product's ratingAverage/ratingCount (spec 8.3).
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireShopUser('shop.products')
  if (gate.error) return gate.error

  const { id } = await params
  const parsed = Body.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: 'Invalid status' }, { status: 400 })

  const review = await updateReviewStatus(id, parsed.data.status)
  if (!review) return NextResponse.json({ error: 'Review not found' }, { status: 404 })
  await recomputeProductRating(review.productId)

  return NextResponse.json({ review })
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireShopUser('shop.products')
  if (gate.error) return gate.error

  const { id } = await params
  const review = await getReviewById(id)
  if (!review) return NextResponse.json({ error: 'Review not found' }, { status: 404 })

  await deleteReview(id)
  await recomputeProductRating(review.productId)
  return NextResponse.json({ success: true })
}
