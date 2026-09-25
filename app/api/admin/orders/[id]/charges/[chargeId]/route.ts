import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireShopUser } from '@/modules/shop/lib/access'
import { getOrderById } from '@/modules/shop/lib/db/orders'
import { getChargeById } from '@/modules/shop/lib/db/order-charges'
import {
  cancelOrderKeepingCharge, recordChargePaidByHand, sendChargeRaisedEmail, waiveOrderCharge,
} from '@/modules/shop/lib/order-charges'

// What staff can do with a charge still waiting to be paid:
//
//   waive        - let it go; the order comes off hold
//   mark-paid    - the customer paid some other way (over the phone, say)
//   cancel-order - the customer rang to cancel instead: refund what they paid,
//                  less the charge, and close the order
//   resend       - send the "charge to pay" email again
const Body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('waive') }),
  z.object({
    action: z.literal('mark-paid'),
    reference: z.string().trim().max(200).nullable().optional(),
    emailCustomer: z.boolean().optional(),
  }),
  z.object({ action: z.literal('cancel-order') }),
  z.object({ action: z.literal('resend') }),
])

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; chargeId: string }> }) {
  const gate = await requireShopUser('shop.orders')
  if (gate.error) return gate.error

  const { id, chargeId } = await params
  const parsed = Body.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' }, { status: 400 })

  // The charge has to belong to the order in the address, so a stale screen
  // for one order can never settle another order's charge.
  const charge = await getChargeById(chargeId)
  if (!charge || charge.orderId !== id) return NextResponse.json({ error: 'Charge not found' }, { status: 404 })

  switch (parsed.data.action) {
    case 'waive': {
      const outcome = await waiveOrderCharge(chargeId, gate.user.id)
      if (!outcome.ok) return NextResponse.json({ error: outcome.error }, { status: outcome.status })
      return NextResponse.json({ charge: outcome.charge })
    }
    case 'mark-paid': {
      const outcome = await recordChargePaidByHand(chargeId, {
        userId: gate.user.id,
        reference: parsed.data.reference || null,
        emailCustomer: parsed.data.emailCustomer ?? true,
      })
      if (!outcome.ok) return NextResponse.json({ error: outcome.error }, { status: outcome.status })
      return NextResponse.json({ charge: outcome.charge })
    }
    case 'cancel-order': {
      const outcome = await cancelOrderKeepingCharge(chargeId, { kind: 'staff', userId: gate.user.id })
      if (!outcome.ok) return NextResponse.json({ error: outcome.error }, { status: outcome.status })
      return NextResponse.json({ charge: outcome.charge, refunded: outcome.refunded })
    }
    case 'resend': {
      if (charge.status !== 'PENDING') return NextResponse.json({ error: 'That charge has already been settled.' }, { status: 409 })
      const order = await getOrderById(id)
      if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })
      await sendChargeRaisedEmail(order, charge)
      return NextResponse.json({ charge })
    }
  }
}
