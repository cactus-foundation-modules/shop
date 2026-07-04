import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireShopUser } from '@/modules/shop/lib/access'
import { getOrderById, logOrderEmail } from '@/modules/shop/lib/db/orders'
import { sendEmail } from '@/lib/email/index'

const Body = z.object({ subject: z.string().min(1), body: z.string().min(1) })

// Manual send, logged to shp_order_emails (spec 8.3 POST /admin/orders/[id]/email).
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireShopUser('shop.orders')
  if (gate.error) return gate.error

  const { id } = await params
  const order = await getOrderById(id)
  if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })

  const parsed = Body.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: 'Invalid email' }, { status: 400 })

  await sendEmail({ to: order.customerEmail, subject: parsed.data.subject, html: parsed.data.body, text: parsed.data.body.replace(/<[^>]+>/g, ' ') })
  await logOrderEmail(order.id, parsed.data.subject, order.customerEmail, 'MANUAL')

  return NextResponse.json({ success: true })
}
