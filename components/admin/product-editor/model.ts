/** Shape, validation and dirty-tracking for the product editor.
 *
 * Numeric fields are held as strings while editing so a half-typed "12." or a
 * cleared box stays exactly what the admin typed; they are converted once, on
 * save. Holding them as numbers is what makes a price box fight the cursor.
 */

import type { ShpPriceType } from '@/modules/shop/lib/pricing'

export type ProductStatus = 'DRAFT' | 'ACTIVE' | 'ARCHIVED'
export type RecommendationMode = 'MANUAL' | 'AUTOMATIC'
export type MediaItem = { type: 'IMAGE' | 'VIDEO_FILE' | 'VIDEO_URL'; url: string; altText?: string | null; isPrimary?: boolean }
export type PickedProduct = { id: string; name: string }
export type Term = { id: string; name: string; slug: string }
export type CategoryTerm = Term & { parentId: string | null; position: number }

export type ProductForm = {
  name: string
  slug: string
  /** Save-time intent, not a stored field: rebuild the slug from the name. */
  regenerateSlug: boolean
  type: string
  status: ProductStatus
  description: string
  shortDescription: string
  sku: string
  barcode: string
  price: string
  salePrice: string
  retailPrice: string
  tradePrice: string
  costPrice: string
  taxClassId: string
  trackInventory: boolean
  stockCount: string
  lowStockThreshold: string
  outOfStockBehaviour: 'BLOCK' | 'BACKORDER'
  weight: string
  weightUnit: 'kg' | 'lb'
  dimensionL: string
  dimensionW: string
  dimensionH: string
  dimensionUnit: 'cm' | 'in'
  metaTitle: string
  metaDescription: string
  masterCategoryId: string
  isPreOrder: boolean
  preOrderDispatchDate: string
  preOrderNote: string
  preOrderMaxQuantity: string
  preOrderCount: number
  digitalFileId: string
  downloadLimit: string
  downloadExpiry: string
  relatedMode: RecommendationMode
  relatedLimit: string
  upsellMode: RecommendationMode
  upsellLimit: string
}

export type EditorState = {
  form: ProductForm
  media: MediaItem[]
  categoryIds: string[]
  tagIds: string[]
  collectionIds: string[]
  related: PickedProduct[]
  upsells: PickedProduct[]
  excluded: PickedProduct[]
}

/** What every tab panel is handed by the shell. */
export type PanelProps = {
  state: EditorState
  /** Update one product field. */
  setField: <K extends keyof ProductForm>(key: K, value: ProductForm[K]) => void
  /** Update anything else on the editor state (media, category ids, pickers). */
  patch: (fn: (state: EditorState) => EditorState) => void
  errors: Errors
  currency: string
  /** Which optional price types the shop has switched on. A panel offers a box
   * only for the ones listed; a value already stored against a switched-off type
   * is left alone rather than blanked, so switching it back on gets it back. */
  enabledPriceTypes: ShpPriceType[]
}

/** What the product GET endpoint sends back. */
export type ProductPayload = {
  product: Record<string, unknown>
  media: Array<{ type: string; url: string; altText: string | null; isPrimary: boolean }>
  categoryIds: string[]
  tagIds: string[]
  collectionIds: string[]
  relatedProducts: PickedProduct[]
  upsellProducts: PickedProduct[]
  excludedProducts: PickedProduct[]
}

const str = (v: unknown): string => (v == null ? '' : String(v))
const bool = (v: unknown): boolean => v === true

export function toEditorState(payload: ProductPayload): EditorState {
  const p = payload.product
  return {
    form: {
      name: str(p.name),
      slug: str(p.slug),
      regenerateSlug: false,
      type: str(p.type),
      status: (str(p.status) || 'DRAFT') as ProductStatus,
      description: str(p.description),
      shortDescription: str(p.shortDescription),
      sku: str(p.sku),
      barcode: str(p.barcode),
      price: str(p.price),
      salePrice: str(p.salePrice),
      retailPrice: str(p.retailPrice),
      tradePrice: str(p.tradePrice),
      costPrice: str(p.costPrice),
      taxClassId: str(p.taxClassId),
      trackInventory: bool(p.trackInventory),
      stockCount: str(p.stockCount),
      lowStockThreshold: str(p.lowStockThreshold),
      outOfStockBehaviour: (str(p.outOfStockBehaviour) || 'BLOCK') as ProductForm['outOfStockBehaviour'],
      weight: str(p.weight),
      weightUnit: (str(p.weightUnit) || 'kg') as ProductForm['weightUnit'],
      dimensionL: str(p.dimensionL),
      dimensionW: str(p.dimensionW),
      dimensionH: str(p.dimensionH),
      dimensionUnit: (str(p.dimensionUnit) || 'cm') as ProductForm['dimensionUnit'],
      metaTitle: str(p.metaTitle),
      metaDescription: str(p.metaDescription),
      masterCategoryId: str(p.masterCategoryId),
      isPreOrder: bool(p.isPreOrder),
      preOrderDispatchDate: str(p.preOrderDispatchDate).slice(0, 10),
      preOrderNote: str(p.preOrderNote),
      preOrderMaxQuantity: str(p.preOrderMaxQuantity),
      preOrderCount: typeof p.preOrderCount === 'number' ? p.preOrderCount : 0,
      digitalFileId: str(p.digitalFileId),
      downloadLimit: str(p.downloadLimit),
      downloadExpiry: str(p.downloadExpiry),
      relatedMode: (str(p.relatedMode) || 'MANUAL') as RecommendationMode,
      relatedLimit: str(p.relatedLimit) || '4',
      upsellMode: (str(p.upsellMode) || 'MANUAL') as RecommendationMode,
      upsellLimit: str(p.upsellLimit) || '4',
    },
    media: payload.media.map((m) => ({ type: m.type as MediaItem['type'], url: m.url, altText: m.altText, isPrimary: m.isPrimary })),
    categoryIds: payload.categoryIds,
    tagIds: payload.tagIds,
    collectionIds: payload.collectionIds,
    related: payload.relatedProducts,
    upsells: payload.upsellProducts,
    excluded: payload.excludedProducts,
  }
}

/** "" means "clear it"; a bad number means "don't send it" (validation blocks save first). */
const num = (v: string): number | null => {
  const t = v.trim()
  if (t === '') return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}
const int = (v: string): number | null => {
  const n = num(v)
  return n == null ? null : Math.trunc(n)
}
const nullable = (v: string): string | null => (v.trim() === '' ? null : v.trim())

/** The PUT body for the product's own fields. */
export function toProductBody(s: EditorState): Record<string, unknown> {
  const f = s.form
  return {
    name: f.name.trim(),
    regenerateSlug: f.regenerateSlug,
    status: f.status,
    description: nullable(f.description),
    shortDescription: nullable(f.shortDescription),
    sku: nullable(f.sku),
    barcode: nullable(f.barcode),
    price: num(f.price) ?? 0,
    salePrice: num(f.salePrice),
    retailPrice: num(f.retailPrice),
    tradePrice: num(f.tradePrice),
    costPrice: num(f.costPrice),
    taxClassId: nullable(f.taxClassId),
    trackInventory: f.trackInventory,
    stockCount: f.trackInventory ? int(f.stockCount) : null,
    lowStockThreshold: f.trackInventory ? int(f.lowStockThreshold) : null,
    outOfStockBehaviour: f.outOfStockBehaviour,
    weight: num(f.weight),
    weightUnit: f.weight.trim() === '' ? null : f.weightUnit,
    dimensionL: num(f.dimensionL),
    dimensionW: num(f.dimensionW),
    dimensionH: num(f.dimensionH),
    dimensionUnit: [f.dimensionL, f.dimensionW, f.dimensionH].every((d) => d.trim() === '') ? null : f.dimensionUnit,
    metaTitle: nullable(f.metaTitle),
    metaDescription: nullable(f.metaDescription),
    isPreOrder: f.isPreOrder,
    preOrderDispatchDate: f.isPreOrder ? nullable(f.preOrderDispatchDate) : null,
    preOrderNote: f.isPreOrder ? nullable(f.preOrderNote) : null,
    preOrderMaxQuantity: f.isPreOrder ? int(f.preOrderMaxQuantity) : null,
    digitalFileId: nullable(f.digitalFileId),
    downloadLimit: int(f.downloadLimit),
    downloadExpiry: int(f.downloadExpiry),
    // Position is the only cover there is. The storefront prefers an isPrimary
    // flag over order (card-template.tsx), so re-stamping it from the order here
    // is what makes dragging an image to the front actually change the cover.
    media: s.media.map((m, i) => ({ ...m, isPrimary: i === 0 })),
    categoryIds: s.categoryIds,
    masterCategoryId: nullable(f.masterCategoryId),
    tagIds: s.tagIds,
    collectionIds: s.collectionIds,
  }
}

// --- Tabs ------------------------------------------------------------------

export const SHOP_TAB_ORDER = {
  details: 10,
  media: 20,
  pricing: 30,
  stock: 40,
  digital: 45,
  organisation: 60,
  recommendations: 70,
  seo: 80,
} as const

export type ShopTabId = keyof typeof SHOP_TAB_ORDER

/** Which form fields each tab owns, so an unsaved edit dots the tab it came from. */
const TAB_FIELDS: Record<ShopTabId, ReadonlyArray<keyof ProductForm>> = {
  details: ['name', 'regenerateSlug', 'status', 'sku', 'barcode', 'shortDescription', 'description'],
  media: [],
  pricing: ['price', 'salePrice', 'retailPrice', 'tradePrice', 'costPrice', 'taxClassId'],
  stock: [
    'trackInventory', 'stockCount', 'lowStockThreshold', 'outOfStockBehaviour',
    'isPreOrder', 'preOrderDispatchDate', 'preOrderNote', 'preOrderMaxQuantity',
    'weight', 'weightUnit', 'dimensionL', 'dimensionW', 'dimensionH', 'dimensionUnit',
  ],
  digital: ['digitalFileId', 'downloadLimit', 'downloadExpiry'],
  organisation: ['masterCategoryId'],
  recommendations: ['relatedMode', 'relatedLimit', 'upsellMode', 'upsellLimit'],
  seo: ['metaTitle', 'metaDescription'],
}

/** The non-form slices each tab owns. */
const TAB_EXTRAS: Partial<Record<ShopTabId, (s: EditorState) => unknown>> = {
  media: (s) => s.media,
  organisation: (s) => [s.categoryIds, s.tagIds, s.collectionIds],
  recommendations: (s) => [s.related, s.upsells, s.excluded],
}

export function isTabDirty(tab: ShopTabId, current: EditorState, baseline: EditorState): boolean {
  for (const key of TAB_FIELDS[tab]) {
    if (current.form[key] !== baseline.form[key]) return true
  }
  const extra = TAB_EXTRAS[tab]
  if (extra && JSON.stringify(extra(current)) !== JSON.stringify(extra(baseline))) return true
  return false
}

export function isDirty(current: EditorState, baseline: EditorState): boolean {
  return (Object.keys(SHOP_TAB_ORDER) as ShopTabId[]).some((t) => isTabDirty(t, current, baseline))
}

// --- Validation ------------------------------------------------------------

export type Errors = Partial<Record<keyof ProductForm, string>>

const positiveNumber = (v: string): boolean => {
  const t = v.trim()
  if (t === '') return true
  const n = Number(t)
  return Number.isFinite(n) && n >= 0
}

export function validate(s: EditorState): Errors {
  const f = s.form
  const e: Errors = {}

  if (!f.name.trim()) e.name = 'Give the product a name.'

  if (f.price.trim() === '') e.price = 'Set a price. Use 0 for a free product.'
  else if (!positiveNumber(f.price)) e.price = 'Price must be a number, and not negative.'

  // A sale price is the only optional figure that changes what a shopper pays,
  // so it is the only one that has to sit below the normal price. Catching it
  // here means nobody publishes an "offer" that costs more than not having one.
  if (!positiveNumber(f.salePrice)) e.salePrice = 'Sale price must be a number, and not negative.'
  else if (f.salePrice.trim() !== '' && Number(f.salePrice) >= Number(f.price || 0)) {
    e.salePrice = 'The sale price is what the item drops to, so it needs to be lower than the price. Otherwise it is not an offer.'
  }

  if (!positiveNumber(f.retailPrice)) e.retailPrice = 'Retail price must be a number, and not negative.'
  if (!positiveNumber(f.tradePrice)) e.tradePrice = 'Trade price must be a number, and not negative.'
  if (!positiveNumber(f.costPrice)) e.costPrice = 'Cost price must be a number, and not negative.'

  if (f.trackInventory && f.stockCount.trim() !== '' && !Number.isInteger(Number(f.stockCount))) {
    e.stockCount = 'Stock count must be a whole number.'
  }
  if (f.trackInventory && f.lowStockThreshold.trim() !== '' && !Number.isInteger(Number(f.lowStockThreshold))) {
    e.lowStockThreshold = 'Low stock threshold must be a whole number.'
  }

  for (const key of ['weight', 'dimensionL', 'dimensionW', 'dimensionH'] as const) {
    if (!positiveNumber(f[key])) e[key] = 'Must be a number, and not negative.'
  }

  if (f.isPreOrder && f.preOrderMaxQuantity.trim() !== '' && !Number.isInteger(Number(f.preOrderMaxQuantity))) {
    e.preOrderMaxQuantity = 'Max quantity must be a whole number.'
  }

  // The recommendations endpoints demand a positive whole number and reject
  // anything else, so catch it here rather than half-way through a save.
  for (const key of ['relatedLimit', 'upsellLimit'] as const) {
    const n = Number(f[key])
    if (f[key].trim() === '' || !Number.isInteger(n) || n < 1) {
      e[key] = 'Show at least one, as a whole number.'
    }
  }

  return e
}

/** Which tab an errored field lives on, so the tab can be marked and jumped to. */
export function tabForField(field: keyof ProductForm): ShopTabId {
  for (const tab of Object.keys(TAB_FIELDS) as ShopTabId[]) {
    if (TAB_FIELDS[tab].includes(field)) return tab
  }
  return 'details'
}
