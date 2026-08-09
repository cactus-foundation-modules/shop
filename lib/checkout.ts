// PROTECTED - server-only money maths (spec 19). The client never calculates
// tax or totals; every quantity here is recalculated from scratch on the
// server on every checkout step, using live product/coupon/shipping data.
import { getProductsByIds } from '@/modules/shop/lib/db/products'
import { getTaxRateForZoneAndClass, listShippingRatesForZone, resolveWeightBasedRate, getShippingRateById } from '@/modules/shop/lib/db/tax-shipping'
import { getCouponByCode, listAutomaticDiscounts } from '@/modules/shop/lib/db/discounts'
import { countPriorCouponOrdersByEmail } from '@/modules/shop/lib/db/orders'
import { getShopConfigCached } from '@/modules/shop/lib/config'
import { effectivePrice } from '@/modules/shop/lib/pricing'
import { getCartLineResolvers, getCartLineResolverPrefetchers, resolveLineMeta, type CartLineCharge, type CartLineControl, type CartLineGroup, type CartLineTitle } from '@/modules/shop/lib/line-meta'
import type { CartLine } from '@/modules/shop/components/public/cart'
import type { LineMeta, ShpProduct } from '@/modules/shop/lib/types'

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
  // Personalisation carried from the cart line: the stable client key and the
  // normalised, server-priced meta (null for a plain line). unitPrice already
  // includes any personalisation price adjustment.
  lineId?: string
  lineMeta: LineMeta | null
  // Optional per-line picker a cart-line resolver offered (e.g. a delivery-tier
  // select). Display-only - it never affects the order, only the live cart UI.
  control?: CartLineControl | null
  // Optional cart-display retitle a resolver offered (e.g. a variant's base name
  // + chosen options). Display-only - the order still snapshots product.name.
  displayTitle?: CartLineTitle | null
  // How much of this LINE's price (already inside lineSubtotal) a resolver
  // attributes to a named charge rather than to the goods - see CartLineCharge.
  // Held here as line totals, not per unit, so every consumer sums the same way.
  charges?: CartLineCharge[] | null
  // Which basket group this line belongs to, if a resolver declared one - see
  // CartLineGroup. Display ordering only; it never moves money.
  group?: CartLineGroup | null
}

// Turns a resolver's per-unit charge attributions into this line's own totals,
// capped so they can never claim more than the line is actually worth. Where the
// cap bites, the charges are scaled down together rather than one being dropped:
// every one of them is real money the shopper is paying, and silently losing a
// whole "Delivery" row reads far worse than a rounded-down one.
function attributeCharges(
  charges: CartLineCharge[] | null | undefined,
  unitPrice: number,
  quantity: number,
): CartLineCharge[] | null {
  if (!charges?.length) return null
  const lineTotal = Math.max(0, unitPrice * quantity)
  const raw = charges.map((c) => ({ label: c.label, amount: c.amount * quantity }))
  const attributed = raw.reduce((sum, c) => sum + c.amount, 0)
  if (attributed <= 0) return null
  const scale = attributed > lineTotal ? lineTotal / attributed : 1
  const scaled = raw.map((c) => ({ label: c.label, amount: round2(c.amount * scale) })).filter((c) => c.amount > 0)
  return scaled.length ? scaled : null
}

// Re-checks stock/price/status for every cart line - the only source of
// truth the checkout flow trusts (spec 8.1 POST /cart/validate).
export async function resolveCartLines(cart: CartLine[]): Promise<ResolvedCartLine[]> {
  // Everything the fold needs, gathered in one batched pass up front rather than
  // per line: the resolvers and their optional batch prefetchers, the shop
  // config, and every cart product in a single query (a getProductById per line
  // was one of three N+1 fans that made a full cart take seconds).
  const [resolvers, prefetchers, { enabledPriceTypes }, products] = await Promise.all([
    getCartLineResolvers(),
    getCartLineResolverPrefetchers(),
    getShopConfigCached(),
    getProductsByIds(cart.map((line) => line.productId)),
  ])

  // Warm every contributing module's request-scoped cache once for the whole
  // cart (delivery estimates, add-on lookups). After this the per-line resolvers
  // read from cache instead of each firing its own handful of queries. The full
  // line view (product + quantity + raw meta) rides along for prefetchers whose
  // per-line answers depend on the rest of the basket - see CartLinePrefetchLine.
  const cartProducts = [...products.values()]
  if (prefetchers.length > 0 && cartProducts.length > 0) {
    const prefetchLines = cart
      .map((line) => {
        const product = products.get(line.productId)
        return product ? { product, quantity: line.quantity, meta: line.meta } : null
      })
      .filter((line): line is { product: ShpProduct; quantity: number; meta: Record<string, unknown> | undefined } => line !== null)
    await Promise.all(prefetchers.map((prefetch) => prefetch(cartProducts, prefetchLines)))
  }

  // Resolve every line concurrently. Each line is now an independent set of cache
  // reads (product from the batch map + any cart-line resolvers reading their
  // warmed caches); walking the cart sequentially multiplied that by the line
  // count and made a full cart take seconds. Order is preserved (Promise.all
  // keeps input order); a skipped line returns null and is filtered out, exactly
  // as the old `continue` dropped it.
  const resolved = await Promise.all(cart.map(async (line): Promise<ResolvedCartLine | null> => {
    const product = products.get(line.productId)
    if (!product || product.status !== 'ACTIVE') return null

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

    // Personalisation add-ons: a registered resolver validates the shopper's
    // inputs and returns a server-authoritative price adjustment. An invalid
    // input fails the line just like an out-of-stock one. The client never
    // sends a price - only the raw meta it collected.
    const metaResolution = await resolveLineMeta(product, line.meta, resolvers)
    if (!metaResolution.valid) {
      available = false
      availabilityReason = metaResolution.reason ?? 'Please check the options on this item'
    }

    // effectivePrice, not product.price: a product on offer is charged its sale
    // price. Resolved here rather than at display time so the figure charged is
    // the one the server worked out, never one the client sent.
    const unitPrice = effectivePrice(product, enabledPriceTypes) + metaResolution.priceAdjust
    return {
      product,
      quantity: line.quantity,
      unitPrice,
      lineSubtotal: unitPrice * line.quantity,
      available,
      availabilityReason,
      isPreOrder: product.isPreOrder,
      lineId: line.lineId,
      lineMeta: metaResolution.persistMeta,
      control: metaResolution.control ?? null,
      displayTitle: metaResolution.displayTitle ?? null,
      // Per-unit from the resolver (it prices one unit), multiplied out here so
      // the line's charge sits on the same footing as its subtotal. Attributing
      // more than the line costs would make the cart's goods figure go negative,
      // so the charges are never allowed to outrun the line price - a provider
      // and a discounted product can otherwise disagree about what is left.
      charges: attributeCharges(metaResolution.charges, unitPrice, line.quantity),
      group: metaResolution.group ?? null,
    }
  }))
  return resolved.filter((line): line is ResolvedCartLine => line !== null)
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
      const priorUses = await countPriorCouponOrdersByEmail(customerEmail, coupon.id)
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
  // Display-only breakdown of `subtotal`, so the checkout can show the same
  // "Subtotal / Delivery / VAT / Total" the basket does. `charges` are the named
  // slices resolvers attributed out of the line prices (a delivery service),
  // summed by label across the order, and `goodsSubtotal` is what is left.
  // `subtotal` and `total` are deliberately UNCHANGED by this - they are the
  // figures the order is written and the card is charged with, and nothing here
  // moves money, it only says what the money already there was for.
  charges: CartLineCharge[]
  goodsSubtotal: number
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

  // Same fold the basket does, over the resolved lines: charges merge by label
  // in the order the order first mentions them.
  const charges: CartLineCharge[] = []
  for (const line of params.lines) {
    for (const charge of line.charges ?? []) {
      const row = charges.find((c) => c.label === charge.label)
      if (row) row.amount = round2(row.amount + charge.amount)
      else charges.push({ label: charge.label, amount: round2(charge.amount) })
    }
  }
  const chargeTotal = charges.reduce((sum, c) => sum + c.amount, 0)

  return {
    subtotal: round2(subtotal),
    discountAmount: round2(discounts.discountAmount),
    shippingAmount: round2(shippingAmount),
    taxAmount: round2(taxAmount),
    total: round2(Math.max(total, 0)),
    taxMode: config.taxMode,
    couponId: discounts.couponId,
    lineItems,
    charges,
    goodsSubtotal: round2(subtotal - chargeTotal),
  }
}
