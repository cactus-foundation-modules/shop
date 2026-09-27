import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireShopUser } from '@/modules/shop/lib/access'
import { resendFailedOrderEmail } from '@/modules/shop/lib/email'

const Body = z.object({ noteId: z.string().min(1) })

// One failed send, from the order's own timeline, tried again exactly as it
// was written the first time - see lib/email.ts. Gated the same as the status
// change next to it: read-only shop access is enough to see that a send
// failed, not enough to make the site send mail.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireShopUser('shop.orders')
  if (gate.error) return gate.error

  const { id } = await params
  const parsed = Body.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Which note?' }, { status: 400 })

  const outcome = await resendFailedOrderEmail(id, parsed.data.noteId)
  if (!outcome.ok) return NextResponse.json({ error: outcome.error }, { status: outcome.status })

  return NextResponse.json({ success: true })
}
