import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { subscribeBackInStock, unsubscribeBackInStock } from '@/modules/shop/lib/db/back-in-stock'
import { getProductById } from '@/modules/shop/lib/db/products'
import { getMemberFromCookie } from '@/lib/members/session'
import { verifyUnsubscribeToken } from '@/modules/shop/lib/unsubscribe-token'
import { checkInMemoryRateLimit, getClientIpFromRequest } from '@/modules/shop/lib/rate-limit'

const SubscribeBody = z.object({ productId: z.string(), email: z.string().email() })

// Idempotent subscribe - repeat subscribes just return 200 (addendum A.4).
export async function POST(request: NextRequest) {
  const ip = getClientIpFromRequest(request)
  if (!checkInMemoryRateLimit(`back-in-stock:${ip}`, 20, 60 * 60 * 1000)) {
    return NextResponse.json({ error: 'Too many requests, please try again later.' }, { status: 429 })
  }

  const parsed = SubscribeBody.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })

  const product = await getProductById(parsed.data.productId)
  if (!product) return NextResponse.json({ error: 'Product not found' }, { status: 404 })

  const member = await getMemberFromCookie().catch(() => null)
  await subscribeBackInStock(product.id, parsed.data.email, member?.id ?? null)
  return NextResponse.json({ subscribed: true })
}

// Unsubscribe via signed token from the email link - no DB lookup needed to validate it.
export async function DELETE(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token')
  if (!token) return NextResponse.json({ error: 'Missing token' }, { status: 400 })

  const verified = verifyUnsubscribeToken(token)
  if (!verified) return NextResponse.json({ error: 'Invalid or expired unsubscribe link' }, { status: 400 })

  await unsubscribeBackInStock(verified.productId, verified.email)
  return NextResponse.json({ unsubscribed: true })
}
