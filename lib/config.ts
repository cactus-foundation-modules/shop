import { z } from 'zod'
import { prisma } from '@/lib/db/prisma'
import { isPayPalConfigured, isStripeConfigured } from '@/modules/shop/lib/env'

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

  // Payment methods. Free-form strings rather than a closed enum so module-
  // contributed methods (via the shop.payment-providers extension point) can be
  // enabled here too; availability is still gated in getAvailablePaymentMethods.
  enabledPaymentMethods: z.array(z.string()).default(['STRIPE']),
  bankTransferInstructions: z.string().default(''),
  cashInstructions: z.string().default(''),

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

// Enabled payment methods filtered by actual availability - a method the admin
// has ticked but never configured (Stripe/PayPal keys missing, or a module
// provider reporting itself unconfigured) can never reach checkout.
export async function getAvailablePaymentMethods(): Promise<string[]> {
  const config = await getShopConfigCached()
  // Dynamic import keeps this file free of a static registry <-> config cycle
  // (bank-transfer / cash providers import getShopConfigCached from here).
  const { getPaymentProvider, getAllPaymentProviders } = await import('@/modules/shop/lib/payments/registry')

  const builtInIds = new Set(['STRIPE', 'PAYPAL', 'BANK_TRANSFER', 'CASH'])
  const available: string[] = []

  // Built-in methods are chosen in shop settings (enabledPaymentMethods) and
  // gated by their env presence.
  for (const method of config.enabledPaymentMethods) {
    if (method === 'STRIPE') { if (isStripeConfigured()) available.push(method); continue }
    if (method === 'PAYPAL') { if (isPayPalConfigured()) available.push(method); continue }
    if (method === 'BANK_TRANSFER' || method === 'CASH') { available.push(method); continue } // no env vars
    // A module method explicitly ticked in shop settings is still honoured.
    const provider = getPaymentProvider(method)
    if (provider && (provider.isAvailable ? await provider.isAvailable() : true)) available.push(method)
  }

  // Module-contributed methods self-manage their availability from their own
  // settings tab (isAvailable), so they appear when configured without needing
  // to be added to enabledPaymentMethods in shop's settings UI.
  for (const provider of getAllPaymentProviders()) {
    if (builtInIds.has(provider.id) || available.includes(provider.id)) continue
    if (provider.isAvailable ? await provider.isAvailable() : true) available.push(provider.id)
  }

  return available
}
