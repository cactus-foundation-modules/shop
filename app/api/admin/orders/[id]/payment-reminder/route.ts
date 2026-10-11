import { NextResponse } from 'next/server'
import { requireShopUser } from '@/modules/shop/lib/access'
import { sendPaymentReminder } from '@/modules/shop/lib/payment-reminder'

// "Send payment reminder" on an order still waiting for its bank transfer or
// cash. Same gate as marking it paid, the button next to it.
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireShopUser('shop.orders')
  if (gate.error) return gate.error

  const { id } = await params
  const outcome = await sendPaymentReminder(id, gate.user.id)
  if (!outcome.ok) return NextResponse.json({ error: outcome.error }, { status: outcome.status })

  return NextResponse.json({ success: true })
}
