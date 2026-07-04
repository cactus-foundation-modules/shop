import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { resolveCartLines, resolveOrderTotals } from '@/modules/shop/lib/checkout'
import { findShippingZoneForPostcode, getShippingRateById } from '@/modules/shop/lib/db/tax-shipping'
import { createPendingOrder } from '@/modules/shop/lib/db/orders'
import { generateOrderNumber } from '@/modules/shop/lib/order-number'
import { getShopConfigCached, getAvailablePaymentMethods } from '@/modules/shop/lib/config'
import { paymentProviders } from '@/modules/shop/lib/payments/registry'
import { getMemberFromCookie } from '@/lib/members/session'
import { checkInMemoryRateLimit, getClientIpFromRequest } from '@/modules/shop/lib/rate-limit'
import type { ShpAddress } from '@/modules/shop/lib/types'

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
  billingAddress: AddressSchema.nullable().optional(),
  shippingRateId: z.string().nullable().optional(),
  couponCode: z.string().nullable().optional(),
  paymentMethod: z.enum(['STRIPE', 'PAYPAL', 'BANK_TRANSFER', 'CASH']),
})

// PROTECTED - creates the PENDING order (Q8) then the provider intent. Stock
// is not decremented here (only on ship/paid, see product PUT and confirm route).
export async function POST(request: NextRequest) {
  // This endpoint creates a real DB order row AND a live provider intent (Stripe
  // PaymentIntent / PayPal order) on every call, so it is the most expensive
  // public mutating route - rate-limit it per IP like apply-coupon/back-in-stock.
  const ip = getClientIpFromRequest(request)
  if (!checkInMemoryRateLimit(`payment-intent:${ip}`, 10, 15 * 60 * 1000)) {
    return NextResponse.json({ error: 'Too many attempts, please try again in a little while.' }, { status: 429 })
  }

  const parsed = Body.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' }, { status: 400 })
  const data = parsed.data

  const config = await getShopConfigCached()
  if (config.shopStatus !== 'OPEN') return NextResponse.json({ error: 'The shop is not currently accepting orders.' }, { status: 503 })

  const available = await getAvailablePaymentMethods()
  if (!available.includes(data.paymentMethod)) return NextResponse.json({ error: 'Selected payment method is not available.' }, { status: 400 })

  const resolvedLines = await resolveCartLines(data.lines)
  if (resolvedLines.some((l) => !l.available) || resolvedLines.length === 0) {
    return NextResponse.json({ error: 'Some items in your cart are no longer available.' }, { status: 409 })
  }

  const zone = await findShippingZoneForPostcode(data.shippingAddress.postcode)
  const totals = await resolveOrderTotals({
    lines: resolvedLines,
    zoneId: zone?.id ?? null,
    shippingRateId: data.shippingRateId ?? null,
    couponCode: data.couponCode ?? null,
    customerEmail: data.customerEmail,
  })

  const shippingRate = data.shippingRateId ? await getShippingRateById(data.shippingRateId) : null
  const member = await getMemberFromCookie().catch(() => null)
  const orderNumber = await generateOrderNumber()

  const { id: orderId } = await createPendingOrder({
    orderNumber,
    memberId: member?.id ?? null,
    customerEmail: data.customerEmail,
    customerName: data.customerName,
    customerPhone: data.customerPhone ?? null,
    shippingAddress: data.shippingAddress as ShpAddress,
    billingAddress: (data.billingAddress as ShpAddress | null) ?? null,
    subtotal: totals.subtotal,
    discountAmount: totals.discountAmount,
    shippingAmount: totals.shippingAmount,
    taxAmount: totals.taxAmount,
    total: totals.total,
    taxMode: totals.taxMode,
    currency: config.currency,
    couponId: totals.couponId, // the coupon actually resolved server-side, if any
    couponCode: data.couponCode ?? null,
    paymentMethod: data.paymentMethod,
    shippingRateId: shippingRate?.id ?? null,
    shippingRateName: shippingRate?.name ?? null,
    items: totals.lineItems.map((l) => ({
      productId: l.product.id,
      productName: l.product.name,
      productSku: l.product.sku,
      productType: l.product.type,
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      taxRate: l.taxRate,
      taxAmount: l.taxAmount,
      total: l.lineTotal,
      isPreOrder: l.isPreOrder,
      preOrderDispatchDate: l.product.preOrderDispatchDate,
    })),
  })

  const provider = paymentProviders[data.paymentMethod]
  const intent = await provider.createIntent({
    orderId, orderNumber, amount: totals.total, currency: config.currency,
    customerEmail: data.customerEmail, customerName: data.customerName,
  })

  return NextResponse.json({ orderId, orderNumber, ...intent })
}
