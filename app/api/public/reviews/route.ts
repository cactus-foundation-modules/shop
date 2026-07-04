import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getMemberFromCookie } from '@/lib/members/session'
import { getMembersConfig } from '@/lib/members/config'
import { getProductById } from '@/modules/shop/lib/db/products'
import { createReview, hasReviewedProduct } from '@/modules/shop/lib/db/reviews'
import { hasCompletedOrderForProduct } from '@/modules/shop/lib/db/orders'
import { checkInMemoryRateLimit, getClientIpFromRequest } from '@/modules/shop/lib/rate-limit'

const Body = z.object({ productId: z.string(), rating: z.number().int().min(1).max(5), title: z.string().max(120).optional(), body: z.string().max(4000).optional() })

// Member session required, one review per member per product, verified-
// purchase flag when a completed order matches (spec 8.1, Q18).
export async function POST(request: NextRequest) {
  const membersConfig = await getMembersConfig()
  if (!membersConfig.enabled) return NextResponse.json({ error: 'Reviews require a member account.' }, { status: 403 })

  const member = await getMemberFromCookie()
  if (!member) return NextResponse.json({ error: 'Please sign in to leave a review.' }, { status: 401 })

  const ip = getClientIpFromRequest(request)
  if (!checkInMemoryRateLimit(`review:${ip}`, 10, 60 * 60 * 1000)) {
    return NextResponse.json({ error: 'Too many reviews submitted, please try again later.' }, { status: 429 })
  }

  const parsed = Body.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: 'Invalid review' }, { status: 400 })

  const product = await getProductById(parsed.data.productId)
  if (!product) return NextResponse.json({ error: 'Product not found' }, { status: 404 })

  if (await hasReviewedProduct(product.id, member.id)) {
    return NextResponse.json({ error: 'You have already reviewed this product.' }, { status: 409 })
  }

  const isVerified = await hasCompletedOrderForProduct(member.email, product.id)
  const { id } = await createReview({
    productId: product.id,
    memberId: member.id,
    authorName: member.displayName || member.username,
    rating: parsed.data.rating,
    title: parsed.data.title ?? null,
    body: parsed.data.body ?? null,
    isVerified,
  })

  return NextResponse.json({ id, status: 'PENDING' }, { status: 201 })
}
