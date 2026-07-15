import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { resolveCartLines, resolveOrderTotals } from '@/modules/shop/lib/checkout'
import { findShippingZoneForPostcode, listShippingRatesForZone } from '@/modules/shop/lib/db/tax-shipping'
import { getShopConfigCached } from '@/modules/shop/lib/config'
import { formatMoney } from '@/modules/shop/lib/money'

const Body = z.object({
  lines: z.array(z.object({ productId: z.string(), quantity: z.number().int().min(1), lineId: z.string().optional(), meta: z.record(z.unknown()).optional() })),
  postcode: z.string().optional(),
  shippingRateId: z.string().nullable().optional(),
  couponCode: z.string().nullable().optional(),
  customerEmail: z.string().email().nullable().optional(),
})

// PROTECTED - server-only totals (spec 19). Recalculated on every address or
// coupon change; the client never computes tax.
export async function POST(request: NextRequest) {
  const parsed = Body.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: 'Invalid checkout session request' }, { status: 400 })
  const { lines: rawLines, postcode, shippingRateId, couponCode, customerEmail } = parsed.data

  const config = await getShopConfigCached()
  if (config.shopStatus !== 'OPEN') return NextResponse.json({ error: 'The shop is not currently accepting orders.' }, { status: 503 })

  const resolvedLines = await resolveCartLines(rawLines)
  const unavailable = resolvedLines.filter((l) => !l.available)
  if (unavailable.length > 0) {
    return NextResponse.json({ error: 'Some items in your cart are no longer available', unavailable: unavailable.map((l) => l.product.slug) }, { status: 409 })
  }
  if (resolvedLines.length === 0) return NextResponse.json({ error: 'Your cart is empty' }, { status: 400 })

  const zone = postcode ? await findShippingZoneForPostcode(postcode) : null
  const shippingRates = zone ? await listShippingRatesForZone(zone.id) : []

  const totals = await resolveOrderTotals({
    lines: resolvedLines,
    zoneId: zone?.id ?? null,
    shippingRateId: shippingRateId ?? null,
    couponCode: couponCode ?? null,
    customerEmail: customerEmail ?? null,
  })

  if (config.minimumOrderValue != null && totals.subtotal < config.minimumOrderValue) {
    return NextResponse.json({ error: `Minimum order value is ${formatMoney(config.minimumOrderValue, config.currencySymbol)}` }, { status: 400 })
  }
  if (config.maximumOrderValue != null && totals.subtotal > config.maximumOrderValue) {
    return NextResponse.json({ error: `Maximum order value is ${formatMoney(config.maximumOrderValue, config.currencySymbol)}` }, { status: 400 })
  }

  const hasPreOrderItems = resolvedLines.some((l) => l.isPreOrder)

  return NextResponse.json({
    subtotal: totals.subtotal,
    discountAmount: totals.discountAmount,
    shippingAmount: totals.shippingAmount,
    taxAmount: totals.taxAmount,
    total: totals.total,
    taxMode: totals.taxMode,
    currencySymbol: config.currencySymbol,
    shippingRates: shippingRates.map((r) => ({ id: r.id, name: r.name, estimatedDays: r.estimatedDays })),
    hasPreOrderItems,
    preOrderMixedCartBehaviour: config.preOrderMixedCartBehaviour,
  })
}
