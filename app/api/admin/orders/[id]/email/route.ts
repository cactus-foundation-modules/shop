import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireShopUser } from '@/modules/shop/lib/access'
import { getOrderById, logOrderEmail } from '@/modules/shop/lib/db/orders'
import { sendEmail } from '@/lib/email/index'
import { MANUAL_EMAIL_BODY_MAX_LENGTH, MANUAL_EMAIL_SUBJECT_MAX_LENGTH } from '@/modules/shop/lib/admin-input-limits'

// Ceilings from lib/admin-input-limits.ts, in words, because the email box
// shows this message to whoever wrote the email.
const Body = z.object({
  subject: z.string().min(1, 'Give the email a subject.')
    .max(MANUAL_EMAIL_SUBJECT_MAX_LENGTH, `That subject is too long - ${MANUAL_EMAIL_SUBJECT_MAX_LENGTH} characters at most.`),
  body: z.string().min(1, 'Write the message first.')
    // No figure in this one: the ceiling is on the HTML the box makes of the
    // message, which is longer than what was typed by an amount nobody can see.
    .max(MANUAL_EMAIL_BODY_MAX_LENGTH, 'That message is too long for one email - try splitting it into two.'),
})

// Manual send, logged to shp_order_emails (spec 8.3 POST /admin/orders/[id]/email).
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireShopUser('shop.orders')
  if (gate.error) return gate.error

  const { id } = await params
  const order = await getOrderById(id)
  if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })

  const parsed = Body.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid email' }, { status: 400 })

  await sendEmail({ moduleName: 'shop', to: order.customerEmail, subject: parsed.data.subject, html: parsed.data.body, text: parsed.data.body.replace(/<[^>]+>/g, ' ') })
  await logOrderEmail(order.id, parsed.data.subject, order.customerEmail, 'MANUAL')

  return NextResponse.json({ success: true })
}
