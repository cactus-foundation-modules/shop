import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireShopUser } from '@/modules/shop/lib/access'
import { getShopConfigCached } from '@/modules/shop/lib/config'
import { getOrderById, getOrderItems } from '@/modules/shop/lib/db/orders'
import { latestCancellationNote, listChargesForOrder } from '@/modules/shop/lib/db/order-charges'
import { chargePayMethods, pendingCharge, planCancellation, raiseOrderCharge } from '@/modules/shop/lib/order-charges'
import { MAX_CHARGE_NET, suggestedChargeTaxRate } from '@/modules/shop/lib/order-charge-money'

// Redelivery charges on one order, after a failed delivery. See
// lib/order-charges.ts for what raising, changing, paying and cancelling each do.

// GET - the charges this order has had, plus what the "charge for redelivery" form and
// the pending charge's buttons need to say: the tax rate to start from, whether
// the customer can pay online at all, and what cancelling would refund.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireShopUser('shop.orders', { allowAccess: true })
  if (gate.error) return gate.error

  const { id } = await params
  const order = await getOrderById(id)
  if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })

  const [charges, items, config] = await Promise.all([listChargesForOrder(id), getOrderItems(id), getShopConfigCached()])
  const pending = pendingCharge(charges)
  const [methods, cancellation, lastCancellationNote] = await Promise.all([
    chargePayMethods(config),
    pending ? planCancellation(order, pending) : Promise.resolve(null),
    latestCancellationNote(),
  ])

  return NextResponse.json({
    charges,
    suggestedTaxRate: suggestedChargeTaxRate(items),
    taxLabel: config.invoiceTaxLabel || 'VAT',
    // The form's starting words for why there is a cancellation charge: the
    // shop's own, from the last charge that had one.
    lastCancellationNote,
    // Names only - the admin screen says which ways the customer will be
    // offered, or that there are none and the payment will need recording.
    payMethods: methods.map((method) => method.label),
    cancellation: cancellation
      ? (cancellation.ok
          ? { ok: true, refund: cancellation.refund, held: cancellation.held, kept: cancellation.kept }
          : { ok: false, error: cancellation.error })
      : null,
  })
}

const RaiseBody = z.object({
  note: z.string().trim().max(2000, 'Keep the note under 2000 characters.').nullable().optional(),
  netAmount: z.number().positive('Enter the redelivery fee.').max(MAX_CHARGE_NET),
  cancellationNet: z.number().min(0, 'The cancellation charge must be nothing, or an amount.').max(MAX_CHARGE_NET),
  cancellationNote: z.string().trim().max(2000, 'Keep the cancellation charge explanation under 2000 characters.').nullable().optional(),
  taxRate: z.number().min(0).max(100),
  holdOrder: z.boolean(),
  emailCustomer: z.boolean(),
})

// POST - raise one. Gated on shop.orders WITHOUT allowAccess: read-only access
// may look at an order, not bill the customer for something.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireShopUser('shop.orders')
  if (gate.error) return gate.error

  const { id } = await params
  const parsed = RaiseBody.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid charge' }, { status: 400 })

  const outcome = await raiseOrderCharge({
    orderId: id,
    note: parsed.data.note || null,
    netAmount: parsed.data.netAmount,
    cancellationNet: parsed.data.cancellationNet,
    cancellationNote: parsed.data.cancellationNote || null,
    taxRate: parsed.data.taxRate,
    holdOrder: parsed.data.holdOrder,
    emailCustomer: parsed.data.emailCustomer,
    userId: gate.user.id,
  })
  if (!outcome.ok) return NextResponse.json({ error: outcome.error }, { status: outcome.status })
  return NextResponse.json({ charge: outcome.charge }, { status: 201 })
}
