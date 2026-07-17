import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { subscribeBackInStock, unsubscribeBackInStock } from '@/modules/shop/lib/db/back-in-stock'
import { getProductById } from '@/modules/shop/lib/db/products'
import { getMemberFromCookie } from '@/lib/members/session'
import { verifyUnsubscribeToken } from '@/modules/shop/lib/unsubscribe-token'
import { checkInMemoryRateLimit, getClientIpFromRequest } from '@/modules/shop/lib/rate-limit'
import { shopClosedResponse } from '@/modules/shop/lib/access'

const SubscribeBody = z.object({ productId: z.string(), email: z.string().email() })

// Idempotent subscribe - repeat subscribes just return 200 (addendum A.4).
export async function POST(request: NextRequest) {
  const closed = await shopClosedResponse()
  if (closed) return closed

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
// Deliberately not behind the CLOSED gate, here or on GET below: an unsubscribe
// link that has already gone out to someone's inbox has to keep working even
// while the shop is shut.
export async function DELETE(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token')
  if (!token) return NextResponse.json({ error: 'Missing token' }, { status: 400 })

  const verified = verifyUnsubscribeToken(token)
  if (!verified) return NextResponse.json({ error: 'Invalid or expired unsubscribe link' }, { status: 400 })

  await unsubscribeBackInStock(verified.productId, verified.email)
  return NextResponse.json({ unsubscribed: true })
}

// Email clients follow links with GET, not DELETE - this is the handler the unsubscribe link in
// the back-in-stock email actually hits. Same signed-token verification, HTML response instead of JSON.
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token')
  const verified = token ? verifyUnsubscribeToken(token) : null

  const message = verified
    ? "You've been unsubscribed from back-in-stock alerts for this product."
    : 'This unsubscribe link is invalid or has expired.'

  if (verified) {
    await unsubscribeBackInStock(verified.productId, verified.email)
  }

  return new NextResponse(
    `<!doctype html><html><head><meta charset="utf-8"><title>Unsubscribe</title></head><body style="font-family:sans-serif;max-width:32rem;margin:4rem auto;text-align:center;padding:0 1rem;"><p>${message}</p></body></html>`,
    { status: verified ? 200 : 400, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  )
}
