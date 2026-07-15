import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireShopUser } from '@/modules/shop/lib/access'
import { listOrders, createPendingOrder } from '@/modules/shop/lib/db'
import { resolveCartLines, resolveOrderTotals } from '@/modules/shop/lib/checkout'
import { findShippingZoneForPostcode } from '@/modules/shop/lib/db/tax-shipping'
import { generateOrderNumber } from '@/modules/shop/lib/order-number'
import { getShopConfigCached } from '@/modules/shop/lib/config'

export async function GET(request: NextRequest) {
  const gate = await requireShopUser('shop.orders', { allowAccess: true })
  if (gate.error) return gate.error

  const params = request.nextUrl.searchParams
  const { orders, total } = await listOrders({
    status: (params.get('status') as never) ?? undefined,
    paymentStatus: (params.get('paymentStatus') as never) ?? undefined,
    search: params.get('search') ?? undefined,
    preOrder: params.get('preOrder') === 'true',
    page: params.get('page') ? Number(params.get('page')) : undefined,
    perPage: params.get('perPage') ? Number(params.get('perPage')) : undefined,
  })
  return NextResponse.json({ orders, total })
}

const AddressSchema = z.object({
  firstName: z.string().min(1), lastName: z.string().min(1), company: z.string().optional(),
  line1: z.string().min(1), line2: z.string().optional(), city: z.string().min(1), county: z.string().optional(),
  postcode: z.string().min(1), country: z.string().min(2).default('GB'), phone: z.string().optional(),
})

const Body = z.object({
  lines: z.array(z.object({ productId: z.string(), quantity: z.number().int().min(1) })),
  customerEmail: z.string().email(),
  customerName: z.string().min(1),
  customerPhone: z.string().optional(),
  shippingAddress: AddressSchema,
  paymentMethod: z.enum(['STRIPE', 'PAYPAL', 'BANK_TRANSFER', 'CASH']),
})

// Manual order creation (spec 8.3 POST /admin/orders) - phone/mail-order style
// sales an admin enters directly. Created PENDING; use confirm-payment to mark paid.
export async function POST(request: NextRequest) {
  const gate = await requireShopUser('shop.orders')
  if (gate.error) return gate.error

  const parsed = Body.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid order' }, { status: 400 })
  const data = parsed.data

  const config = await getShopConfigCached()
  const resolvedLines = await resolveCartLines(data.lines)
  if (resolvedLines.length === 0) return NextResponse.json({ error: 'No valid items' }, { status: 400 })

  const zone = await findShippingZoneForPostcode(data.shippingAddress.postcode)
  const totals = await resolveOrderTotals({ lines: resolvedLines, zoneId: zone?.id ?? null, shippingRateId: null, couponCode: null, customerEmail: data.customerEmail })
  const orderNumber = await generateOrderNumber()

  const { id } = await createPendingOrder({
    orderNumber,
    customerEmail: data.customerEmail,
    customerName: data.customerName,
    customerPhone: data.customerPhone ?? null,
    shippingAddress: data.shippingAddress,
    subtotal: totals.subtotal,
    discountAmount: totals.discountAmount,
    shippingAmount: totals.shippingAmount,
    taxAmount: totals.taxAmount,
    total: totals.total,
    taxMode: totals.taxMode,
    currency: config.currency,
    paymentMethod: data.paymentMethod,
    items: totals.lineItems.map((l) => ({
      productId: l.product.id, productName: l.product.name, productSku: l.product.sku, productType: l.product.type,
      quantity: l.quantity, unitPrice: l.unitPrice, taxRate: l.taxRate, taxAmount: l.taxAmount, total: l.lineTotal,
      isPreOrder: l.isPreOrder, preOrderDispatchDate: l.product.preOrderDispatchDate, lineMeta: l.lineMeta,
    })),
  })

  return NextResponse.json({ id, orderNumber }, { status: 201 })
}
