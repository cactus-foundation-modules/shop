import { z } from 'zod'
import { prisma } from '@/lib/db/prisma'
import { isPayPalConfigured, isStripeConfigured } from '@/modules/shop/lib/env'
import { resolvePaymentMethodOrder, sortPaymentMethods } from '@/modules/shop/lib/payments/admin-methods'

// Shop config, stored as a single JSON column on the shp_settings singleton
// row (Q2 - no shopConfig column on core SiteConfig). Same "corrupted/partial
// column always falls back to defaults" approach as MembersConfig.

const CheckoutStepSchema = z.object({
  id: z.string(), // "contact" | "shipping" | "payment" | "review"
  label: z.string(),
  enabled: z.boolean(),
  required: z.boolean(),
})

const DEFAULT_CHECKOUT_STEPS = [
  { id: 'contact', label: 'Contact details', enabled: true, required: true },
  { id: 'shipping', label: 'Shipping', enabled: true, required: true },
  { id: 'payment', label: 'Payment', enabled: true, required: true },
  { id: 'review', label: 'Review', enabled: true, required: true },
]

// One tickbox the shopper has to deal with before the order can be placed.
// The terms-and-conditions box is stored separately (its own trio of settings,
// because it can fall back to the site's own terms page); everything else the
// owner invents lives in `checkoutAgreements` as one of these.
//
// `statement` may carry one bracketed run - "I agree to the [terms]" - which
// becomes the link when `linkUrl` is set. No brackets and a link still set puts
// the link after the sentence, so a statement written before anyone thought
// about links never loses its link.
const CheckoutAgreementSchema = z.object({
  id: z.string(),
  statement: z.string(),
  linkUrl: z.string().default(''),
  required: z.boolean().default(true),
  enabled: z.boolean().default(true),
})

export type ShpCheckoutAgreementConfig = z.infer<typeof CheckoutAgreementSchema>

export const ShpConfigSchema = z.object({
  // Store identity
  currency: z.string().default('GBP'),
  currencySymbol: z.string().default('£'),
  storeEmail: z.string().default(''),
  orderNumberPrefix: z.string().default('ORD-'),
  weightUnit: z.enum(['kg', 'lb']).default('kg'),
  dimensionUnit: z.enum(['cm', 'in']).default('cm'),

  // Pricing. `price` is always there and always mandatory; this is the set of
  // extra price types the owner has switched on, which decides both what the
  // product editor offers and (for `sale`) what the checkout charges. Defaults
  // to sale + cost, which is exactly what the shop could already do before the
  // other types existed, so switching versions changes nothing on its own.
  enabledPriceTypes: z.array(z.enum(['sale', 'retail', 'trade', 'cost'])).default(['sale', 'cost']),
  // Show the RRP alongside the price on the storefront. Off by default - an RRP
  // is often kept purely as a buying reference and putting it in front of
  // shoppers is a separate decision from recording it.
  showRetailPrice: z.boolean().default(false),

  // Tax
  taxMode: z.enum(['INCLUSIVE', 'EXCLUSIVE']).default('INCLUSIVE'),

  // What the STOREFRONT prints, which is a separate decision from what the
  // figures above mean. A shop keeping its prices net (taxMode EXCLUSIVE) still
  // has to quote consumers gross, and one keeping them gross may want a trade
  // catalogue read net. 'AS_ENTERED' prints them exactly as typed, which is what
  // the shop did before this setting existed - so an upgrade moves no price.
  // The arithmetic and the reasoning live in lib/tax-display-shared.ts.
  priceDisplayTax: z.enum(['AS_ENTERED', 'INCLUSIVE', 'EXCLUSIVE']).default('AS_ENTERED'),
  // Printed after every storefront price ("inc. VAT"). Blank shows nothing.
  // Switching a whole catalogue to gross prices with no word of explanation
  // reads to a returning shopper as a price rise, hence the label.
  priceDisplayTaxSuffix: z.string().default(''),

  // Shipping. Plenty of shops post everything for the same money and never want
  // to see a weight box again. Switching this off drops the weight-based option
  // when adding a shipping rate and hides the weight field on products and
  // variations; rates already saved as weight-based are left alone, so turning
  // it back on gets them back exactly as they were. Defaults on, which is what
  // the shop already did before the switch existed.
  weightBasedShippingEnabled: z.boolean().default(true),

  // Checkout configuration
  guestCheckoutEnabled: z.boolean().default(true),
  postPurchaseAccountPrompt: z.boolean().default(true),
  minimumOrderValue: z.number().nullable().default(null),
  maximumOrderValue: z.number().nullable().default(null),
  requirePhone: z.boolean().default(false),
  checkoutSteps: z.array(CheckoutStepSchema).default(DEFAULT_CHECKOUT_STEPS),

  // Business name at checkout. Off by default: a shop selling to the public has
  // no use for it, and an empty box above the address is one more thing to skip.
  // Enabling it shows the box above address line 1 (where a business address is
  // actually read); requiring it refuses the order without one, both in the
  // browser and at the route that creates the order.
  businessNameFieldEnabled: z.boolean().default(false),
  businessNameRequired: z.boolean().default(false),
  businessNameLabel: z.string().default('Business name'),

  // Terms and conditions tickbox at checkout. Kept apart from the owner's own
  // tickboxes below because it is the one nearly every shop wants and it can
  // point at the site's own terms page without anyone typing a URL - leave
  // `termsAgreementUrl` blank and the checkout links to whatever page is set as
  // the site's terms, so moving that page never leaves a dead link behind.
  termsAgreementEnabled: z.boolean().default(false),
  termsAgreementRequired: z.boolean().default(true),
  termsAgreementStatement: z.string().default('I have read and agree to the [terms and conditions]'),
  termsAgreementUrl: z.string().default(''),

  // The owner's own tickboxes, in the order they appear beneath the terms one.
  checkoutAgreements: z.array(CheckoutAgreementSchema).default([]),

  // Payment methods. Free-form strings rather than a closed enum so module-
  // contributed methods (via the shop.payment-providers extension point) can be
  // enabled here too; availability is still gated in getAvailablePaymentMethods.
  enabledPaymentMethods: z.array(z.string()).default(['STRIPE']),
  // The shop-wide off switch, and the only one a module-contributed method has.
  // A built-in method is on by being listed in enabledPaymentMethods; a module
  // method decides for itself whether it is ready (its own settings tab), which
  // left the owner no way to park one without pulling its credentials out. Being
  // named here overrules both, for every method - see getAvailablePaymentMethods.
  disabledPaymentMethods: z.array(z.string()).default([]),
  // The order the methods are offered in at checkout, as the owner arranged them
  // on the Payments tab. Holds every method it was told about, switched on or
  // not, so switching one back on returns it to where it was. Anything missing
  // (a method added by a module installed since) sorts to the end. Empty until
  // the owner first arranges them, and until then the old order stands: whatever
  // sequence enabledPaymentMethods happens to be in, then the rest.
  paymentMethodOrder: z.array(z.string()).default([]),
  // The line printed under each method's name at checkout, keyed by method id.
  // Only the owner's own wording lives here: a method left out of this map falls
  // back to whatever line its provider ships with, so a shop that has never
  // opened the box still says something sensible. Free-form keys for the same
  // reason as the arrays above - a method from a module installed later must be
  // nameable here without shop knowing about it.
  paymentMethodDescriptions: z.record(z.string(), z.string()).default({}),
  // Method ids whose brand mark is kept off the checkout. Held the way round
  // that leaves an empty list meaning "show them all", so no shop loses the
  // marks it already has, and a method whose provider ships no mark at all is
  // simply unaffected by being named here.
  hiddenPaymentMethodLogos: z.array(z.string()).default([]),
  bankTransferInstructions: z.string().default(''),
  cashInstructions: z.string().default(''),
  // Whether those same words also appear on the checkout page the moment the
  // method is picked, as well as on the thank-you page afterwards. On by
  // default, which is what the shop has always done. An owner who would rather
  // their bank details only went to someone who has actually placed an order
  // can switch this off without emptying the box - the thank-you page and the
  // shopper's order page still print them, so nothing is lost.
  bankTransferInstructionsOnCheckout: z.boolean().default(true),
  cashInstructionsOnCheckout: z.boolean().default(true),

  // Notifications
  adminOrderAlertEmail: z.string().default(''),
  lowStockAlertEnabled: z.boolean().default(true),
  lowStockAlertEmail: z.string().default(''),

  // Shop status
  shopStatus: z.enum(['OPEN', 'BROWSE_ONLY', 'CLOSED']).default('OPEN'),
  shopClosedMessage: z.string().default('Our shop is temporarily unavailable.'),

  // SEO (shopBasePath dropped - Q3, fixed to "shop" via manifest publicBasePath)
  shopTitle: z.string().default(''),
  shopMetaDescription: z.string().default(''),

  // Category browsing - shop-wide default for how a category page lists
  // products. 'rollup' also shows products filed in any descendant category;
  // 'exact' shows only products filed directly on the category. Each category
  // can override this via its own product_display_mode.
  categoryProductDisplayMode: z.enum(['rollup', 'exact']).default('rollup'),

  // What the storefront does with a product that has sold out. One decision at
  // three depths, and 'SHOW' is what the shop has always done: the product stays
  // in the grid wearing its "Out of stock" badge, which suits a shop whose stock
  // comes back next week.
  //
  // 'HIDE_FROM_LISTS' drops it from category pages, collections, product grids,
  // search results and the sitemap while its own page stays up. A link somebody
  // has already shared, an ad still running, or a search engine's memory of the
  // page all land somewhere honest instead of on a not-found page, and the
  // notify-me form on it keeps collecting addresses for when it returns.
  //
  // 'HIDE_EVERYWHERE' takes the page as well, so shoppers get the not-found
  // page. For a shop whose sold out means gone for good.
  //
  // Neither level changes what can be bought: an out-of-stock product could not
  // be bought before this setting existed either. And neither touches the admin
  // Products screen, which always lists everything - hiding the sold-out stock
  // from the person whose job is to reorder it would be a strange way to help.
  //
  // What counts as out of stock is the same rule the "Out of stock" badge has
  // always used: the product tracks stock, has none left, is not on backorder
  // and is not a pre-order. A product not tracking stock at all is never hidden.
  // See lib/stock-visibility.ts.
  outOfStockVisibility: z.enum(['SHOW', 'HIDE_FROM_LISTS', 'HIDE_EVERYWHERE']).default('SHOW'),
  // Whether the hiding applies to signed-in staff too. Off by default: staff
  // keep seeing what shoppers cannot, badged "Out of stock" as ever, because a
  // shop that hides sold-out stock from its own staff is a shop where products
  // quietly vanish and nobody notices for a month. Switch it on to walk the
  // storefront exactly as a shopper sees it.
  outOfStockHiddenFromStaff: z.boolean().default(false),

  // Supplier. Off by default, because plenty of shops never care who they
  // bought the thing from. The label is what the field gets called everywhere
  // it appears - the four presets cover nearly everyone, and 'custom' hands the
  // wording over to supplierLabelCustom.
  supplierFieldEnabled: z.boolean().default(false),
  supplierLabelPreset: z.enum(['Supplier', 'Manufacturer', 'Retailer', 'Importer', 'custom']).default('Supplier'),
  supplierLabelCustom: z.string().default(''),
  // Recording who supplied something and telling shoppers about it are two
  // different decisions, so the storefront gets its own switch.
  supplierShowOnFrontend: z.boolean().default(false),
  supplierFieldScope: z.enum(['PRODUCTS', 'PRODUCTS_AND_VARIATIONS']).default('PRODUCTS'),

  // Back-in-stock (addendum A)
  backInStockAccountPrompt: z.boolean().default(true),

  // Pre-orders (addendum B)
  preOrderMixedCartBehaviour: z.enum(['HOLD_ALL', 'PROMPT_SPLIT']).default('HOLD_ALL'),

  // Customer cancel and return requests.
  //
  // Both default ON: a shopper who cannot ask has to email instead, and that
  // email lands in an inbox with no record against the order. A shop that wants
  // the conversation elsewhere can still turn them off.
  //
  // Neither switch ever decides anything by itself - a request is a request,
  // and an owner approves or declines it. Auto-approval was deliberately left
  // out: money leaving on a timer is not a default anyone should inherit.
  cancelRequestsEnabled: z.boolean().default(true),
  returnRequestsEnabled: z.boolean().default(true),
  // Days after the last parcel goes out that a return can still be asked for.
  // 0 means no window at all rather than "always", so the off switch stays the
  // off switch and this stays a length of time.
  returnWindowDays: z.number().int().min(0).max(3650).default(30),

  // "Buy again" on a past order line. Defaults ON,
  // because re-ordering the thing you already liked is the cheapest sale a shop
  // gets. Off suits a shop whose catalogue moves faster than its order history
  // - made-to-order, one-offs, or anything where sending someone back to a
  // product page a year later is more likely to disappoint than to sell.
  //
  // One switch, one label, two behaviours behind it: a plain line re-adds
  // straight to the basket, a personalised one opens the product page on the
  // variation that was bought so the choices are already made.
  buyAgainEnabled: z.boolean().default(true),
})

export type ShpConfig = z.infer<typeof ShpConfigSchema>

// What the supplier field is actually called on screen. 'custom' with nothing
// typed falls back to "Supplier" rather than rendering a nameless box.
export function resolveSupplierLabel(
  config: Pick<ShpConfig, 'supplierLabelPreset' | 'supplierLabelCustom'>,
): string {
  if (config.supplierLabelPreset === 'custom') return config.supplierLabelCustom.trim() || 'Supplier'
  return config.supplierLabelPreset
}

// One tickbox as the checkout actually renders it: the terms box (when switched
// on) followed by the owner's own, disabled ones dropped. `linkUrl` is already
// resolved - a blank terms URL has been turned into the site's terms page here,
// or the link dropped entirely if the site has not nominated one, so no surface
// downstream has to know that fallback exists.
export type ShpCheckoutAgreement = {
  id: string
  statement: string
  linkUrl: string
  required: boolean
}

export const TERMS_AGREEMENT_ID = 'terms'

// Resolved server-side, never in the browser: the terms link falls back to the
// site's own terms page, which is a core lookup. Both the public config route
// (so the checkout can draw the boxes) and the order-creating route (so it can
// enforce them) read the same list from here, which is what stops the two
// disagreeing about which boxes were compulsory.
export async function resolveCheckoutAgreements(config: ShpConfig): Promise<ShpCheckoutAgreement[]> {
  const agreements: ShpCheckoutAgreement[] = []

  if (config.termsAgreementEnabled) {
    let linkUrl = config.termsAgreementUrl.trim()
    if (!linkUrl) {
      const site = await prisma.siteConfig.findUnique({ where: { id: 'singleton' }, select: { termsPageId: true } })
      const page = site?.termsPageId
        ? await prisma.infoPage.findUnique({ where: { id: site.termsPageId }, select: { slug: true } })
        : null
      linkUrl = page?.slug ? `/${page.slug}` : ''
    }
    agreements.push({
      id: TERMS_AGREEMENT_ID,
      statement: config.termsAgreementStatement.trim() || 'I have read and agree to the [terms and conditions]',
      linkUrl,
      required: config.termsAgreementRequired,
    })
  }

  for (const agreement of config.checkoutAgreements) {
    if (!agreement.enabled) continue
    const statement = agreement.statement.trim()
    // A tickbox with nothing written beside it is an unanswerable question, so
    // it never reaches the shopper - and never blocks the order either.
    if (!statement) continue
    agreements.push({
      id: agreement.id,
      statement,
      linkUrl: agreement.linkUrl.trim(),
      required: agreement.required,
    })
  }

  return agreements
}

export const SHP_CONFIG_DEFAULTS: ShpConfig = ShpConfigSchema.parse({})

export function parseShpConfig(raw: unknown): ShpConfig {
  const result = ShpConfigSchema.safeParse(raw ?? {})
  return result.success ? result.data : SHP_CONFIG_DEFAULTS
}

export async function getShopConfig(): Promise<ShpConfig> {
  const rows = await prisma.$queryRaw<{ config: unknown }[]>`
    SELECT "config" FROM "shp_settings" WHERE "id" = 'singleton' LIMIT 1
  `
  return parseShpConfig(rows[0]?.config)
}

let cachedConfig: ShpConfig | null = null
let cachedConfigAt = 0
const CACHE_TTL_MS = 5_000

export async function getShopConfigCached(): Promise<ShpConfig> {
  const now = Date.now()
  if (cachedConfig && now - cachedConfigAt < CACHE_TTL_MS) return cachedConfig
  const config = await getShopConfig()
  cachedConfig = config
  cachedConfigAt = now
  return config
}

export function invalidateShopConfigCache(): void {
  cachedConfig = null
  cachedConfigAt = 0
}

// Merge-then-validate partial update (MembersConfig pattern).
export async function updateShopConfig(patch: Partial<ShpConfig>): Promise<ShpConfig> {
  const current = await getShopConfig()
  const next = ShpConfigSchema.parse({ ...current, ...patch })
  // Upsert, not a bare UPDATE. The singleton row is seeded by the init
  // migration, but a plain "UPDATE ... WHERE id = 'singleton'" silently affects
  // zero rows if that row is ever missing - the save returns 200 and looks fine,
  // yet nothing persists and the next read falls back to defaults. INSERT ... ON
  // CONFLICT makes a missing row heal itself on first save instead of quietly
  // dropping the write.
  const serialised = JSON.stringify(next)
  await prisma.$executeRaw`
    INSERT INTO "shp_settings" ("id", "config", "updated_at")
    VALUES ('singleton', ${serialised}::jsonb, CURRENT_TIMESTAMP)
    ON CONFLICT ("id") DO UPDATE
      SET "config" = ${serialised}::jsonb, "updated_at" = CURRENT_TIMESTAMP
  `
  invalidateShopConfigCache()
  return next
}

// The four methods shop ships itself. Everything else on the list arrived
// through the shop.payment-providers extension point and gates itself.
export const BUILT_IN_PAYMENT_METHODS = ['STRIPE', 'PAYPAL', 'BANK_TRANSFER', 'CASH'] as const

// Whether one method should be offered at checkout, before ordering. Split out
// because the settings screen wants the same answer per method, and two copies
// of this rule would drift.
export async function isPaymentMethodAvailable(method: string): Promise<boolean> {
  const config = await getShopConfigCached()
  const { getPaymentProvider } = await import('@/modules/shop/lib/payments/registry')
  const provider = getPaymentProvider(method)
  if (!provider) return false
  return paymentMethodAvailability(config, provider)
}

async function paymentMethodAvailability(
  config: ShpConfig,
  provider: { id: string; isAvailable?: () => boolean | Promise<boolean> },
): Promise<boolean> {
  // Switched off here beats everything, including a module method that reports
  // itself perfectly ready.
  if (config.disabledPaymentMethods.includes(provider.id)) return false

  const builtIn = (BUILT_IN_PAYMENT_METHODS as readonly string[]).includes(provider.id)
  if (builtIn) {
    if (!config.enabledPaymentMethods.includes(provider.id)) return false
    if (provider.id === 'STRIPE') return isStripeConfigured()
    if (provider.id === 'PAYPAL') return isPayPalConfigured()
    return true // bank transfer and cash need no credentials
  }

  // Module-contributed methods self-manage their availability from their own
  // settings tab (isAvailable), so they appear once configured without needing
  // to be ticked in shop's settings too.
  return provider.isAvailable ? await provider.isAvailable() : true
}

// Payment methods that would actually reach checkout right now, in the order the
// owner arranged them on the Payments tab. A method ticked but never configured
// (Stripe/PayPal keys missing, or a module provider reporting itself
// unconfigured) never makes it out of here.
export async function getAvailablePaymentMethods(): Promise<string[]> {
  const config = await getShopConfigCached()
  // Dynamic import keeps this file free of a static registry <-> config cycle
  // (bank-transfer / cash providers import getShopConfigCached from here).
  const { getAllPaymentProviders } = await import('@/modules/shop/lib/payments/registry')

  const available: string[] = []
  for (const provider of getAllPaymentProviders()) {
    if (await paymentMethodAvailability(config, provider)) available.push(provider.id)
  }

  return sortPaymentMethods(available, resolvePaymentMethodOrder(config))
}
