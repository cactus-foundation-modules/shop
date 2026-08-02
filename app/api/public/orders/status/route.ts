import { NextRequest, NextResponse } from 'next/server'
import { getOrderByNumberAndEmail, getOrderItems } from '@/modules/shop/lib/db/orders'
import { getShopConfigCached } from '@/modules/shop/lib/config'
import { getPaymentProvider } from '@/modules/shop/lib/payments/registry'
import { shopClosedResponse } from '@/modules/shop/lib/access'

// Guest order lookup: order number + email must both match - no enumeration (spec 8.1).
export async function GET(request: NextRequest) {
  const closed = await shopClosedResponse()
  if (closed) return closed

  const orderNumber = request.nextUrl.searchParams.get('orderNumber')
  const email = request.nextUrl.searchParams.get('email')
  if (!orderNumber || !email) return NextResponse.json({ error: 'orderNumber and email are required' }, { status: 400 })

  const order = await getOrderByNumberAndEmail(orderNumber, email)
  if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })

  const items = await getOrderItems(order.id)
  const config = await getShopConfigCached()

  // Manual payment methods have no provider confirmation step, so the
  // instructions the shopper needs (where to send the transfer / bring the
  // cash) only live in shop settings - surface them here for the confirmation page.
  let instructions: string | null = null
  if (order.paymentMethod === 'BANK_TRANSFER' || order.paymentMethod === 'CASH') {
    instructions = order.paymentMethod === 'BANK_TRANSFER' ? config.bankTransferInstructions : config.cashInstructions
  }

  // Whether this method has no automated confirmation at all. It decides what
  // "awaiting confirmation" is telling the shopper, and the two readings are
  // opposites: on a manual method nothing has been paid yet and the ball is in
  // their court, whereas on an automated one the money is authorised and simply
  // settling. Taken from the provider's own confirmMode rather than a list of
  // method codes here, so a module that contributes a manual method is read
  // correctly and shop never has to name anyone else's.
  const manualPayment = getPaymentProvider(order.paymentMethod)?.confirmMode === 'manual'

  return NextResponse.json({ order, items, instructions, manualPayment, currencySymbol: config.currencySymbol })
}
