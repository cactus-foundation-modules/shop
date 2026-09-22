import { NextRequest, NextResponse } from 'next/server'
import { requireShopUser } from '@/modules/shop/lib/access'
import { clearStrandedPayment } from '@/modules/shop/lib/stranded-payments'

// DELETE - the owner has dealt with a stranded payment: refunded it, or taken
// the order again by hand. Until now the only thing that cleared the notice was
// the draft becoming an order on its own, so a payment settled by any other
// route sat on the orders screen for good and trained everybody to ignore the
// one banner that means money is missing. shop.orders, like every other change
// to an order's money.
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ draftId: string }> }) {
  const gate = await requireShopUser('shop.orders')
  if (gate.error) return gate.error

  const { draftId } = await params
  await clearStrandedPayment(draftId)
  return NextResponse.json({ cleared: true })
}
