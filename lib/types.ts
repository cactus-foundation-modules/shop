// Shared row/domain types for the shop module's $queryRaw data layer.
// Table/column names in modules/shop/migrations/001_initial.sql are the
// source of truth; these types describe the camelCase shape callers see.

export type PuckData = { root: { props?: Record<string, unknown> }; content: unknown[]; zones?: Record<string, unknown> }

// Per-line personalisation, normalised for generic display. A shop.cart-line-resolver
// provider (e.g. shop-variations) produces this from the shopper's raw inputs; shop
// snapshots it onto the order line (shp_order_items.line_meta) and renders the
// label/value pairs wherever it lists line items. A `href` renders the value as a
// download link (used by file-upload personalisation).
export type LineMetaField = { label: string; value: string; href?: string }
export type LineMeta = { fields: LineMetaField[] }

export type ShpAddress = {
  firstName: string
  lastName: string
  company?: string
  line1: string
  line2?: string
  city: string
  county?: string
  postcode: string
  country: string // ISO 3166-1 alpha-2, default "GB"
  phone?: string
}

export type ShpProductType = 'PHYSICAL' | 'DIGITAL' | 'SERVICE'
export type ShpProductStatus = 'DRAFT' | 'ACTIVE' | 'ARCHIVED'
export type ShpOutOfStockBehaviour = 'BLOCK' | 'BACKORDER'
export type ShpRecommendationMode = 'MANUAL' | 'AUTOMATIC'

export type ShpProduct = {
  id: string
  name: string
  slug: string
  type: ShpProductType
  status: ShpProductStatus
  description: string | null
  shortDescription: string | null
  sku: string | null
  barcode: string | null
  // Who the shop got it from. Always carried on the row; whether it is offered
  // in the editor or shown to shoppers is a settings question, not a data one.
  supplier: string | null
  // Only `price` is mandatory. The rest are optional price types the owner
  // switches on per shop; `salePrice` is the only one that changes what gets
  // charged. See lib/pricing.ts for how they resolve.
  price: string
  salePrice: string | null
  retailPrice: string | null
  tradePrice: string | null
  costPrice: string | null
  taxClassId: string | null
  trackInventory: boolean
  stockCount: number | null
  lowStockThreshold: number | null
  outOfStockBehaviour: ShpOutOfStockBehaviour
  weight: string | null
  weightUnit: string | null
  dimensionL: string | null
  dimensionW: string | null
  dimensionH: string | null
  dimensionUnit: string | null
  digitalFileId: string | null
  downloadLimit: number | null
  downloadExpiry: number | null
  metaTitle: string | null
  metaDescription: string | null
  ogImageId: string | null
  masterCategoryId: string | null
  isPreOrder: boolean
  preOrderDispatchDate: Date | null
  preOrderNote: string | null
  preOrderMaxQuantity: number | null
  preOrderCount: number
  relatedMode: ShpRecommendationMode
  upsellMode: ShpRecommendationMode
  relatedLimit: number
  upsellLimit: number
  // Purchasable but hidden from the catalogue (grid/search/sitemap/own URL).
  // Backs shop-variations child rows; false for ordinary products.
  catalogueHidden: boolean
  createdAt: Date
  updatedAt: Date
}

export type ShpProductMedia = {
  id: string
  productId: string
  type: 'IMAGE' | 'VIDEO_FILE' | 'VIDEO_URL'
  url: string
  altText: string | null
  position: number
  isPrimary: boolean
  createdAt: Date
}

export type ShpCategory = {
  id: string
  name: string
  slug: string
  description: string | null
  parentId: string | null
  position: number
  // NULL = inherit the shop-wide default; 'rollup' = list descendant products
  // too; 'exact' = only products filed directly on this category.
  productDisplayMode: 'rollup' | 'exact' | null
  metaTitle: string | null
  metaDescription: string | null
  ogImageId: string | null
  createdAt: Date
  updatedAt: Date
}

export type ShpTag = { id: string; name: string; slug: string }

export type ShpCollection = {
  id: string
  name: string
  slug: string
  description: string | null
  imageId: string | null
  position: number
  metaTitle: string | null
  metaDescription: string | null
  ogImageId: string | null
  createdAt: Date
  updatedAt: Date
}

// A supplier in the directory. Products point at one by name (shp_products.supplier),
// so `name` is the join key as well as the label - see migrations/007_suppliers.sql.
// discountPercent is a plain number rather than a Decimal because it is only ever
// displayed and edited, never used in a price calculation.
export type ShpSupplier = {
  id: string
  name: string
  accountNumber: string | null
  discountPercent: number | null
  status: 'ENABLED' | 'DISABLED'
  contactName: string | null
  phone: string | null
  email: string | null
  address: string | null
  notes: string | null
  createdAt: Date
  updatedAt: Date
}

/**
 * One of a supplier's own catalogues - the price list or brochure they publish,
 * usually as a Google Sheet. Owned by the supplier row (ON DELETE CASCADE), and
 * unrelated to the shop's own product catalogue despite sharing the word.
 */
export type ShpSupplierCatalogue = {
  id: string
  supplierId: string
  name: string
  /** Web address the catalogue lives at, typically a Google Sheet. */
  sheetUrl: string | null
  position: number
}

/** A supplier plus how much of the catalogue is filed against its name. */
export type ShpSupplierWithCounts = ShpSupplier & {
  /** Catalogue products (catalogue_hidden = false) naming this supplier. */
  productCount: number
  /** Variation child rows (catalogue_hidden = true) naming this supplier. */
  variationCount: number
  /** The supplier's own catalogues, in the owner's order. */
  catalogues: ShpSupplierCatalogue[]
}

export type ShpTaxClass = { id: string; name: string; code: string }

export type ShpShippingZone = {
  id: string
  name: string
  postcodes: string[]
  createdAt: Date
  updatedAt: Date
}

export type ShpTaxZoneRate = { id: string; zoneId: string; taxClassId: string; rate: string }

export type ShpShippingRateType = 'FLAT' | 'WEIGHT_BASED' | 'FREE'
export type ShpShippingRate = {
  id: string
  zoneId: string
  name: string
  type: ShpShippingRateType
  flatRate: string | null
  weightRates: Array<{ upToKg: number; rate: number }> | null
  freeThreshold: string | null
  estimatedDays: string | null
  position: number
  isActive: boolean
}

export type ShpDigitalFile = { id: string; filename: string; url: string; size: number; mimeType: string; createdAt: Date }

export type ShpDigitalDownload = {
  id: string
  orderId: string
  orderItemId: string
  fileId: string
  token: string
  downloadCount: number
  expiresAt: Date | null
  createdAt: Date
}

export type ShpDiscountType = 'PERCENTAGE' | 'FIXED_AMOUNT' | 'FREE_SHIPPING'

export type ShpCoupon = {
  id: string
  code: string
  type: ShpDiscountType
  value: string | null
  minimumOrderValue: string | null
  usageLimit: number | null
  usageCount: number
  perCustomerLimit: number | null
  startsAt: Date | null
  expiresAt: Date | null
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}

export type ShpAutomaticDiscount = {
  id: string
  name: string
  type: ShpDiscountType
  value: string | null
  minimumOrderValue: string | null
  freeShippingThreshold: string | null
  startsAt: Date | null
  expiresAt: Date | null
  isActive: boolean
  priority: number
  createdAt: Date
  updatedAt: Date
}

export type ShpOrderStatus =
  | 'PENDING' | 'PROCESSING' | 'SHIPPED' | 'COMPLETED' | 'CANCELLED' | 'REFUNDED' | 'PARTIALLY_REFUNDED' | 'ON_HOLD'
// Built-in method literals keep autocomplete; `(string & {})` lets module-
// contributed providers (via the shop.payment-providers extension point) use
// their own method codes without shop enumerating them.
export type ShpPaymentMethod = 'STRIPE' | 'PAYPAL' | 'BANK_TRANSFER' | 'CASH' | (string & {})
export type ShpPaymentStatus = 'PENDING' | 'PAID' | 'PARTIALLY_REFUNDED' | 'REFUNDED' | 'FAILED' | 'AWAITING_CONFIRMATION'

export type ShpOrder = {
  id: string
  orderNumber: string
  status: ShpOrderStatus
  memberId: string | null
  customerEmail: string
  customerName: string
  customerPhone: string | null
  shippingAddress: ShpAddress
  billingAddress: ShpAddress | null
  subtotal: string
  discountAmount: string
  shippingAmount: string
  taxAmount: string
  total: string
  taxMode: 'INCLUSIVE' | 'EXCLUSIVE'
  currency: string
  couponId: string | null
  couponCode: string | null
  paymentMethod: ShpPaymentMethod
  paymentStatus: ShpPaymentStatus
  paymentReference: string | null
  paidAt: Date | null
  shippingRateId: string | null
  shippingRateName: string | null
  createdAt: Date
  updatedAt: Date
}

export type ShpOrderItem = {
  id: string
  orderId: string
  productId: string | null
  productName: string
  productSku: string | null
  productType: ShpProductType
  quantity: number
  unitPrice: string
  taxRate: string
  taxAmount: string
  total: string
  refundedQty: number
  isPreOrder: boolean
  preOrderDispatchDate: Date | null
  // Personalisation captured at add-to-cart, priced server-side. NULL for plain lines.
  lineMeta: LineMeta | null
}

export type ShpRefundStatus = 'PENDING' | 'COMPLETED' | 'FAILED'
export type ShpRefund = {
  id: string
  orderId: string
  amount: string
  reason: string | null
  providerRefundId: string | null
  status: ShpRefundStatus
  createdBy: string
  createdAt: Date
}

export type ShpRefundItem = { id: string; refundId: string; orderItemId: string; quantity: number; amount: string }

export type ShpShipment = {
  id: string
  orderId: string
  shippedAt: Date
  trackingNumber: string | null
  carrier: string | null
  notes: string | null
  createdAt: Date
  updatedAt: Date
}

export type ShpShipmentItem = { id: string; shipmentId: string; orderItemId: string; quantity: number }

export type ShpShipmentWithItems = ShpShipment & { items: ShpShipmentItem[] }

// One order line's dispatch position. dispatchedQty is always summed from
// shp_shipment_items - there is no counter column on the order line - and
// outstandingQty is what is still owed to the customer once refunded units are
// taken off, i.e. quantity - refundedQty - dispatchedQty, floored at zero.
export type ShpOrderItemDispatch = {
  orderItemId: string
  productName: string
  quantity: number
  refundedQty: number
  dispatchedQty: number
  outstandingQty: number
}

// Derived display state for a whole order. Deliberately NOT an order status:
// the ShpOrderStatus list is fixed, and dispatch progress is worked out from
// the lines every time it is shown.
export type ShpOrderDispatchSummary = {
  orderId: string
  lines: ShpOrderItemDispatch[]
  // Every dispatchable unit has gone out. False when there is nothing to
  // dispatch at all (a fully refunded or empty order).
  fullyDispatched: boolean
  // Something has gone out, but not everything.
  partiallyDispatched: boolean
}

export type ShpOrderNote = {
  id: string
  orderId: string
  content: string
  isInternal: boolean
  createdBy: string | null
  createdAt: Date
}

export type ShpOrderEmail = { id: string; orderId: string; subject: string; to: string; sentAt: Date; trigger: string }

export type ShpSavedAddress = {
  id: string
  memberId: string
  label: string | null
  isDefault: boolean
  address: ShpAddress
  createdAt: Date
  updatedAt: Date
}

export type ShpEmailTemplateTrigger =
  | 'ORDER_CONFIRMED' | 'STATUS_PROCESSING' | 'STATUS_SHIPPED' | 'STATUS_COMPLETED' | 'STATUS_CANCELLED'
  // Sent per shipment when only some of an order's lines have gone out.
  // STATUS_SHIPPED says the whole order is on its way, so it cannot stand in
  // for this one. See lib/shipment-email.ts.
  | 'PARTIAL_SHIPPED'
  | 'ADMIN_NEW_ORDER' | 'LOW_STOCK' | 'BACK_IN_STOCK' | 'IMPORT_COMPLETE'
export type ShpEmailTemplate = {
  id: string
  trigger: ShpEmailTemplateTrigger
  subject: string
  bodyHtml: string
  isActive: boolean
  updatedAt: Date
}

export type ShpBackInStockSubscription = {
  id: string
  productId: string
  email: string
  memberId: string | null
  notifiedAt: Date | null
  createdAt: Date
}

export type ShpImportStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED'
export type ShpImportJob = {
  id: string
  status: ShpImportStatus
  filename: string
  totalRows: number
  processedRows: number
  createdCount: number
  updatedCount: number
  skippedCount: number
  errors: Array<{ row: number; reason: string }> | null
  columnMap: Record<string, string> | null
  createdBy: string
  startedAt: Date | null
  completedAt: Date | null
  createdAt: Date
}
