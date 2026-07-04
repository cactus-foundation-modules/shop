// PROTECTED - server-only money maths (spec 19). The client never calculates
// tax or totals; every quantity here is recalculated from scratch on the
// server on every checkout step, using live product/coupon/shipping data.
import { getProductById } from '@/modules/shop/lib/db/products'
import { getTaxRateForZoneAndClass, listShippingRatesForZone, resolveWeightBasedRate, getShippingRateById } from '@/modules/shop/lib/db/tax-shipping'
import { getCouponByCode, listAutomaticDiscounts } from '@/modules/shop/lib/db/discounts'
import { countPriorCouponOrdersByEmail } from '@/modules/shop/lib/db/orders'
import { getShopConfigCached } from '@/modules/shop/lib/config'
import type { CartLine } from '@/modules/shop/components/public/cart'
import type { ShpProduct } from '@/modules/shop/lib/types'

// Money is held as floating-point pounds throughout; round every figure that
// gets persisted or charged to 2dp so the stored/charged total can't drift a
// rounding penny from the amounts shown to the shopper.
function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

export type ResolvedCartLine = {
  product: ShpProduct
  quantity: number
  unitPrice: number
  lineSubtotal: number
  available: boolean
  availabilityReason?: string
  isPreOrder: boolean
}

// Re-checks stock/price/status for every cart line - the only source of
// truth the checkout flow trusts (spec 8.1 POST /cart/validate).
export async function resolveCartLines(cart: CartLine[]): Promise<ResolvedCartLine[]> {
  const results: ResolvedCartLine[] = []
  for (const line of cart) {
    const product = await getProductById(line.productId)
    if (!product || product.status !== 'ACTIVE') continue

    let available = true
    let availabilityReason: string | undefined
    if (product.trackInventory) {
      const stock = product.stockCount ?? 0
      if (stock <= 0) {
        if (product.isPreOrder) {
          // pre-order: always allowed regardless of stock, capped by preOrderMaxQuantity
        } else if (product.outOfStockBehaviour === 'BLOCK') {
          available = false
          availabilityReason = 'Out of stock'
        }
      } else if (line.quantity > stock && product.outOfStockBehaviour === 'BLOCK' && !product.isPreOrder) {
        available = false
        availabilityReason = `Only ${stock} left in stock`
      }
    }
    if (
      product.isPreOrder &&
      product.preOrderMaxQuantity != null &&
      product.preOrderCount + line.quantity > product.preOrderMaxQuantity
    ) {
      available = false
      availabilityReason = 'Pre-order is no longer available'
    }

    const unitPrice = Number(product.price)
    results.push({
      product,
      quantity: line.quantity,
      unitPrice,
      lineSubtotal: unitPrice * line.quantity,
      available,
      availabilityReason,
      isPreOrder: product.isPreOrder,
    })
  }
  return results
}

export type DiscountResolution = {
  discountAmount: number
  freeShipping: boolean
  couponId: string | null
  couponCode: string | null
  error?: string
}

// Coupon (explicit) + automatic discounts (priority order) - free shipping
// thresholds apply after coupon discounts (spec 19).
export async function resolveDiscounts(subtotal: number, couponCode: string | null, customerEmail: string | null): Promise<DiscountResolution> {
  let discountAmount = 0
  let freeShipping = false
  let couponId: string | null = null
  let resolvedCode: string | null = null

  if (couponCode) {
    const coupon = await getCouponByCode(couponCode)
    if (!coupon || !coupon.isActive) return { discountAmount: 0, freeShipping: false, couponId: null, couponCode: null, error: 'Coupon not found or inactive' }
    const now = new Date()
    if (coupon.startsAt && coupon.startsAt > now) return { discountAmount: 0, freeShipping: false, couponId: null, couponCode: null, error: 'Coupon is not active yet' }
    if (coupon.expiresAt && coupon.expiresAt < now) return { discountAmount: 0, freeShipping: false, couponId: null, couponCode: null, error: 'Coupon has expired' }
    if (coupon.usageLimit != null && coupon.usageCount >= coupon.usageLimit) return { discountAmount: 0, freeShipping: false, couponId: null, couponCode: null, error: 'Coupon usage limit reached' }
    if (coupon.minimumOrderValue != null && subtotal < Number(coupon.minimumOrderValue)) {
      return { discountAmount: 0, freeShipping: false, couponId: null, couponCode: null, error: `Minimum order value for this coupon is ${coupon.minimumOrderValue}` }
    }
    // Q14: per-customer limit enforced by prior PAID orders BY THIS EMAIL THAT
    // USED THIS COUPON - not every order the customer has ever placed.
    if (coupon.perCustomerLimit != null && customerEmail) {
      const priorUses = await countPriorCouponOrdersByEmail(customerEmail, coupon.code)
      if (priorUses >= coupon.perCustomerLimit) return { discountAmount: 0, freeShipping: false, couponId: null, couponCode: null, error: 'You have already used this coupon' }
    }

    couponId = coupon.id
    resolvedCode = coupon.code
    if (coupon.type === 'PERCENTAGE') discountAmount += subtotal * (Number(coupon.value ?? 0) / 100)
    else if (coupon.type === 'FIXED_AMOUNT') discountAmount += Number(coupon.value ?? 0)
    else if (coupon.type === 'FREE_SHIPPING') freeShipping = true
  }

  // Track the remaining (post-discount) subtotal as we go so each stacked
  // discount only bites into what's actually left - a FIXED_AMOUNT discount
  // must never exceed the remainder, and later discounts see the reduced base.
  let remainingSubtotal = Math.max(subtotal - discountAmount, 0)
  const autoDiscounts = await listAutomaticDiscounts(true)
  for (const disc of autoDiscounts) {
    if (disc.minimumOrderValue != null && remainingSubtotal < Number(disc.minimumOrderValue)) continue
    let applied = 0
    if (disc.type === 'PERCENTAGE') applied = remainingSubtotal * (Number(disc.value ?? 0) / 100)
    else if (disc.type === 'FIXED_AMOUNT') applied = Math.min(Number(disc.value ?? 0), remainingSubtotal)
    else if (disc.type === 'FREE_SHIPPING') freeShipping = true
    discountAmount += applied
    remainingSubtotal = Math.max(remainingSubtotal - applied, 0)
    if (disc.freeShippingThreshold != null && subtotal >= Number(disc.freeShippingThreshold)) freeShipping = true
  }

  return { discountAmount: Math.min(round2(discountAmount), subtotal), freeShipping, couponId, couponCode: resolvedCode }
}

export type ShippingResolution = { rateId: string | null; rateName: string | null; amount: number }

export async function resolveShipping(zoneId: string, rateId: string | null, totalWeightKg: number, freeShipping: boolean): Promise<ShippingResolution> {
  if (freeShipping) return { rateId: null, rateName: 'Free shipping', amount: 0 }

  let rate = rateId ? await getShippingRateById(rateId) : (await listShippingRatesForZone(zoneId))[0]
  // Never price a rate that belongs to a different zone (a rateId can arrive
  // stale if the shopper changed postcode after selecting) - fall back to the
  // resolved zone's default rate instead.
  if (rate && rate.zoneId !== zoneId) rate = (await listShippingRatesForZone(zoneId))[0]
  if (!rate) return { rateId: null, rateName: null, amount: 0 }

  let amount = 0
  if (rate.type === 'FREE') amount = 0
  else if (rate.type === 'FLAT') amount = Number(rate.flatRate ?? 0)
  else if (rate.type === 'WEIGHT_BASED') amount = resolveWeightBasedRate(rate, totalWeightKg) ?? 0

  if (rate.freeThreshold != null) {
    // caller passes the post-discount subtotal comparison in resolveOrderTotals
  }
  return { rateId: rate.id, rateName: rate.name, amount }
}

export type OrderTotals = {
  subtotal: number
  discountAmount: number
  shippingAmount: number
  taxAmount: number
  total: number
  taxMode: 'INCLUSIVE' | 'EXCLUSIVE'
  couponId: string | null
  lineItems: Array<ResolvedCartLine & { taxRate: number; taxAmount: number; lineTotal: number }>
}

// The full server-side total calculation for a checkout session. Tax is
// computed per line at that line's own tax-class rate, over a taxable base
// reduced proportionally by the order-level discount.
export async function resolveOrderTotals(params: {
  lines: ResolvedCartLine[]
  zoneId: string | null
  shippingRateId: string | null
  couponCode: string | null
  customerEmail: string | null
}): Promise<OrderTotals> {
  const config = await getShopConfigCached()
  const subtotal = params.lines.reduce((sum, l) => sum + l.lineSubtotal, 0)
  const discounts = await resolveDiscounts(subtotal, params.couponCode, params.customerEmail)
  const discountRatio = subtotal > 0 ? discounts.discountAmount / subtotal : 0

  let taxAmount = 0
  const lineItems: OrderTotals['lineItems'] = []
  for (const line of params.lines) {
    const taxRate = params.zoneId ? await getTaxRateForZoneAndClass(params.zoneId, line.product.taxClassId) : 0
    const taxableBase = line.lineSubtotal * (1 - discountRatio)
    const lineTax = config.taxMode === 'INCLUSIVE'
      ? taxableBase - taxableBase / (1 + taxRate)
      : taxableBase * taxRate
    taxAmount += lineTax
    lineItems.push({ ...line, taxRate, taxAmount: lineTax, lineTotal: line.lineSubtotal })
  }

  const totalWeightKg = params.lines.reduce((sum, l) => {
    const weight = l.product.weight ? Number(l.product.weight) * l.quantity : 0
    return sum + (l.product.weightUnit === 'lb' ? weight * 0.453592 : weight)
  }, 0)

  const shipping = params.zoneId
    ? await resolveShipping(params.zoneId, params.shippingRateId, totalWeightKg, discounts.freeShipping)
    : { rateId: null, rateName: null, amount: 0 }

  let shippingAmount = shipping.amount
  if (shipping.rateId) {
    const rate = await getShippingRateById(shipping.rateId)
    const postDiscountSubtotal = subtotal - discounts.discountAmount
    if (rate?.freeThreshold != null && postDiscountSubtotal >= Number(rate.freeThreshold)) shippingAmount = 0
  }

  const total = config.taxMode === 'INCLUSIVE'
    ? subtotal - discounts.discountAmount + shippingAmount
    : subtotal - discounts.discountAmount + shippingAmount + taxAmount

  return {
    subtotal: round2(subtotal),
    discountAmount: round2(discounts.discountAmount),
    shippingAmount: round2(shippingAmount),
    taxAmount: round2(taxAmount),
    total: round2(Math.max(total, 0)),
    taxMode: config.taxMode,
    couponId: discounts.couponId,
    lineItems,
  }
}
