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
// `data` is opaque machine-readable state a resolver stashes alongside the human
// fields - shop stores it and hands it back, and never reads or interprets a
// single key of it. It exists because the snapshot is otherwise prose: a module
// that later has to RESTATE one of its own fields (see lib/order-payment-state.ts,
// where a delivery date is re-worded once the money arrives) would otherwise have
// to parse its own sentence back out. Keys are namespaced by the module that
// wrote them, since every resolver's data shares one bag.
// `group` is shop's own generic statement that this line belongs with others in
// the same order - see CartLineGroup in lib/line-meta.ts. Persisted (unlike the
// runtime-only control) because the surfaces that need it - the confirmation
// page, an order email, a quote's document - render long after the resolvers
// ran. Shape kept structural here rather than imported so this file stays free
// of lib/line-meta's server imports for client consumers.
// A cross-line bucket a resolver declares: every line carrying the same `id` is
// listed together under a heading, and the buckets themselves run in ascending
// `sort` order (an ISO date sorts soonest first, which is the point of it). Shop
// never invents a batch and never reads inside one - it compares ids, sorts the
// keys and prints the wording it was handed, exactly as it prints a field.
//
// A bucket can hold lines that agree on the bucket (they arrive on one date) but
// differ in the detail beneath it (one flat-packed, one built), so the wording
// comes in both forms and shop picks by comparing, never by composing:
// - `heading` is what the bucket says when its lines' `detail` differ.
// - `uniformHeading` is what it says when every line in it shares one `detail` -
//   the fuller sentence, since there is one promise to make. Absent falls back
//   to `heading`.
// - `detail` is THIS line's own qualifier, printed under the product only in a
//   mixed bucket (in a uniform one the heading has already said it).
// `fieldLabel` names the line field this all restates: shop hides that field on
// every line whose own batch is the bucket it is sitting in, since a delivery
// promise printed once over the group is the same sentence typed out once per
// product otherwise. A line carried into another bucket (an accessory following
// its desk) keeps its field, so nothing is ever said on its behalf.
export type LineMetaBatch = {
  id: string
  sort: string
  heading: string
  uniformHeading?: string
  detail?: string
  fieldLabel?: string
}

export type LineMeta = {
  fields: LineMetaField[]
  data?: Record<string, unknown>
  group?: { key: string; role: 'main' | 'attachment'; caption?: string; depth?: number; order?: number; collectiveLabel?: string } | null
  // Display bucketing for the surfaces that list a whole order at once - see
  // LineMetaBatch. Persisted for the same reason `group` is: it is shop's own
  // contract, and the surfaces that use it render long after the resolvers ran.
  batch?: LineMetaBatch | null
}

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
  // Opt-in designed description. A Puck content-block document that, when
  // present, renders in place of `description` in the storefront's Description
  // tab (shp_products.description_puck). NULL means the plain-text box wins.
  descriptionPuck: PuckData | null
  shortDescription: string | null
  sku: string | null
  // The code the supplier wants on an order while this one is on offer, where
  // they issue a separate one for discounted stock. Never replaces `sku`, which
  // their stock lists still speak; owner-facing only, and never charged against.
  saleSku: string | null
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
  // The fewest of this the shop will sell in one go. Null - and any figure below
  // 1 - mean no minimum, which is all but every product. A shop-variations child
  // row carries its own and falls back to the parent's, so a minimum can be set
  // once on the product or per combination. See lib/min-order.ts.
  minOrderQuantity: number | null
  relatedMode: ShpRecommendationMode
  upsellMode: ShpRecommendationMode
  relatedLimit: number
  upsellLimit: number
  // Purchasable but hidden from the catalogue (grid/search/sitemap/own URL).
  // Backs shop-variations child rows; false for ordinary products.
  catalogueHidden: boolean
  // Best-seller ordering (lib/popularity.ts). The seed is given, the other is
  // derived from it plus real sales and is what the grids sort on. Higher is
  // better; null means nothing has ranked this product either way.
  popularitySeed: number | null
  popularity: number | null
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
  // The one-liner printed on this category's card. Falls back to `description`
  // wherever a card has nothing shorter to show.
  shortDescription: string | null
  // Opt-in designed description, the category twin of ShpProduct.descriptionPuck
  // (shp_categories.description_puck). NULL means the plain-text box wins.
  // Only ever populated by the single-category fetches - listCategories leaves
  // it null on purpose so a page listing sub-categories does not drag every
  // sibling's whole builder document across the wire.
  descriptionPuck: PuckData | null
  // The category's picture, held as the media item's url verbatim (see
  // shp_categories.image_url).
  imageUrl: string | null
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

export type ShpTag = {
  id: string
  name: string
  slug: string
  description: string | null
  // false files the tag for admin use only: no page of its own, no badge, and
  // nothing about it printed on the shop.
  storefrontVisible: boolean
  // An owner-defined card badge, in place of the two slugs ('new', 'trade') the
  // card template used to look for by hand. Colours are frozen values (a hex, or
  // any plain CSS colour), never `var(--color-N)` palette references - see
  // migrations/019_tag_display.sql. Light and dark are held separately; an unset
  // dark falls back to the light one.
  badgeEnabled: boolean
  badgeLabel: string | null
  badgeBg: string | null
  badgeBgDark: string | null
  badgeText: string | null
  badgeTextDark: string | null
  // Admin list order, and badge precedence when a product carries two badge
  // tags - lowest wins, as with categories.
  position: number
  metaTitle: string | null
  metaDescription: string | null
  // NULL for an ordinary tag, ticked on a product by hand. 'sale' for the
  // pre-made "On Sale" tag: nothing is ever written to shp_product_tags for it,
  // and a product is in it for exactly as long as it is actually reduced. See
  // migrations/019_tag_display.sql.
  autoRule: ShpTagAutoRule
}

export type ShpTagAutoRule = 'sale' | null

// The slice of a tag a product card needs to print a badge. Passed down to
// buildCardContext by every card surface, so the badge is resolved from data the
// page already loaded rather than re-queried per product.
export type ShpTagBadge = {
  slug: string
  name: string
  position: number
  storefrontVisible: boolean
  badgeEnabled: boolean
  badgeLabel: string | null
  badgeBg: string | null
  badgeBgDark: string | null
  badgeText: string | null
  badgeTextDark: string | null
  autoRule: ShpTagAutoRule
}

export type ShpCollection = {
  id: string
  name: string
  slug: string
  description: string | null
  // The one-liner printed on this collection's card and under its heading.
  // Falls back to `description` wherever a card has nothing shorter to show.
  shortDescription: string | null
  // Opt-in designed description, the collection twin of ShpCategory.descriptionPuck
  // (shp_collections.description_puck). NULL means the plain-text box wins.
  // Only ever populated by the single-collection fetches - listCollections
  // leaves it null on purpose, same as listCategories.
  descriptionPuck: PuckData | null
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

// One checkout tickbox as the shopper met it, snapshotted onto the order.
// The wording is stored, not just the setting's id, so an owner rewriting a
// statement later cannot change what a past order appears to have agreed to.
export type ShpOrderAgreement = {
  id: string
  statement: string
  linkUrl: string
  required: boolean
  accepted: boolean
  acceptedAt: string | null
}

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
  // NULL on an order placed while the shop had no tickboxes switched on -
  // "nobody was asked" rather than "asked and ticked nothing".
  agreements: ShpOrderAgreement[] | null
  // How the customer asked to be kept posted. See lib/order-notify.ts, which is
  // the only thing that should be reading these three: a member's account
  // preference outranks them, and the number has to be a mobile to count.
  notifyEmail: boolean
  notifySms: boolean
  notifyPhone: string | null
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

// ---------------------------------------------------------------------------
// Invoices
// ---------------------------------------------------------------------------
//
// Every one of these is a SNAPSHOT taken at the moment of issue and stored as
// JSONB on shp_invoices - never a live read of the order, the settings or the
// catalogue. An invoice is the paperwork for what was charged on a given day,
// so a product renamed next month, a business that moves, or a VAT number typed
// in later must all leave already-issued invoices exactly as they were.

/** Who issued it, as the settings read on the day. */
export type ShpInvoiceSeller = {
  name: string
  addressLines: string[]
  vatNumber: string
  companyNumber: string
  email: string
  phone: string
  /** The site's own name and logo, so the document can head itself without
   *  every block reaching for core config at render time. */
  siteName: string
  siteUrl: string
  logoUrl: string | null
}

/** Who it is for. Addresses are already rendered to lines - the invoice does not
 *  re-format an address that may have been captured under different rules. */
export type ShpInvoiceCustomer = {
  name: string
  company: string
  email: string
  phone: string
  billingAddress: string[]
  shippingAddress: string[]
}

/** One charged line. Money is held as decimal strings, as everywhere else in
 *  the module, and net/tax/gross are all three stored rather than derived, so no
 *  reader has to know which way the shop's tax mode ran. */
export type ShpInvoiceLine = {
  name: string
  sku: string | null
  quantity: number
  /** Per unit, exactly as charged (gross on an INCLUSIVE shop, net on an
   *  EXCLUSIVE one) - the figure the customer recognises from the checkout. */
  unitPrice: string
  /** Quantity times unit price, before any order-level discount. This is the
   *  figure that belongs in the line's money column: a line that showed its
   *  share of a basket-wide coupon would not equal its own arithmetic. */
  lineTotal: string
  taxRatePercent: string
  /** The line's share AFTER any order-level discount, which is what was
   *  actually taxed. These three are what tie to the tax summary and the
   *  totals; `lineTotal` above is what ties to the line's own sum. */
  net: string
  tax: string
  gross: string
  /** Personalisation and options as they were recorded on the order line. */
  detail: { label: string; value: string }[]
  /** Which order line this came from, so a credit note can find the invoice line
   *  a refund is against without matching on name. Optional: invoices raised
   *  before credit notes existed do not carry it, and those fall back to
   *  position (see lib/credit-note-tax.ts). */
  orderItemId?: string | null
}

/** Net, tax and gross at one rate. The part an accountant actually reads, and
 *  what a bookkeeping module needs to file a return - which is why it is stored
 *  rather than worked out again downstream. */
export type ShpInvoiceTaxRow = {
  ratePercent: string
  net: string
  tax: string
  gross: string
}

/** One thing on a document, as a set of books wants it: what it was, and the
 *  money on it at one rate.
 *
 *  Handed over the bookkeeping seam so an entry reads as the list of what was
 *  actually sold rather than one lump per VAT rate. Delivery and any rounding
 *  penny arrive as items of their own, so these rows sum EXACTLY to
 *  `taxBreakdown` - an entry built from them cannot end up disagreeing with the
 *  invoice it came from, which is the only thing that makes them safe to file. */
export type ShpLedgerItem = {
  description: string
  ratePercent: string
  net: string
  tax: string
  gross: string
}

/** Headings and small print as they stood in settings on the day. */
export type ShpInvoiceWording = {
  heading: string
  intro: string
  taxLabel: string
  paymentDetails: string
  terms: string
  footer: string
  /** What stands under the total on a credit note, where "Paid in full" stands
   *  on an invoice. Only ever set on a credit note's own snapshot; absent on
   *  every invoice, and on any credit note raised before it existed. */
  creditWording?: string
}

/** What one registered bookkeeping sink made of this invoice. */
export type ShpInvoiceSinkResult = {
  id: string
  ok: boolean
  /** What the sink did with it, in words an owner can read ("Recorded as
   *  income", "VAT period already filed"). */
  message: string
  at: string
}

export type ShpInvoiceStatus = 'ISSUED' | 'VOID'

export type ShpInvoice = {
  id: string
  orderId: string
  /** The order's number as it stood when the invoice was raised. */
  orderNumber: string
  invoiceNumber: string
  status: ShpInvoiceStatus
  issuedAt: Date
  /** yyyy-mm-dd. The date the VAT belongs to: when the order was paid where
   *  that is known, the issue date otherwise. */
  taxPointDate: string
  dueDate: string | null
  currency: string
  currencySymbol: string
  taxMode: 'INCLUSIVE' | 'EXCLUSIVE'
  subtotal: string
  discountAmount: string
  shippingAmount: string
  taxAmount: string
  total: string
  seller: ShpInvoiceSeller
  customer: ShpInvoiceCustomer
  lines: ShpInvoiceLine[]
  taxBreakdown: ShpInvoiceTaxRow[]
  wording: ShpInvoiceWording
  issuedBy: 'AUTO' | 'MANUAL'
  issueTrigger: string | null
  createdByUserId: string | null
  sinkResults: ShpInvoiceSinkResult[]
  voidedAt: Date | null
  voidReason: string | null
  createdAt: Date
  updatedAt: Date
}

// A credit note: the document that undoes an invoice, in whole or in part.
//
// Same snapshot shape as an invoice on purpose - seller, customer, lines, tax
// breakdown and wording are all the invoice's types - because both documents are
// drawn by the same six blocks on the same `shopInvoice` layout. An owner styles
// their invoice once and the credit note matches it.
//
// Every money figure is a POSITIVE magnitude. The document says what it is in
// its heading, which is how a credit note is written and what a customer expects
// to read; a column of minus signs reads as a mistake. Negating is the job of
// whoever consumes it, which is what the books already do for a voided invoice.
export type ShpCreditNote = {
  id: string
  orderId: string
  orderNumber: string
  creditNoteNumber: string
  /** The invoice being credited. Null only if that invoice row has since been
   *  deleted - the number below is the snapshot that still prints. */
  invoiceId: string | null
  invoiceNumber: string
  /** The refund that caused it, where one did. */
  refundId: string | null
  issuedAt: Date
  /** yyyy-mm-dd. The tax point of the CREDIT - the day the money went back, not
   *  the day of the sale. */
  taxPointDate: string
  currency: string
  currencySymbol: string
  taxMode: 'INCLUSIVE' | 'EXCLUSIVE'
  subtotal: string
  shippingAmount: string
  taxAmount: string
  total: string
  seller: ShpInvoiceSeller
  customer: ShpInvoiceCustomer
  lines: ShpInvoiceLine[]
  taxBreakdown: ShpInvoiceTaxRow[]
  wording: ShpInvoiceWording
  reason: string | null
  issuedBy: 'AUTO' | 'MANUAL'
  createdByUserId: string | null
  sinkResults: ShpInvoiceSinkResult[]
  createdAt: Date
  updatedAt: Date
}

// A customer asking for an order to be called off or sent back. The asking and
// the doing are separate on purpose: approving a request is what calls the
// existing cancel or refund machinery, so a decline - or an approval whose
// refund then fails at the provider - still leaves an honest record of what was
// asked for. See lib/db/order-requests.ts.
export type ShpOrderRequestType = 'CANCEL' | 'RETURN'
export type ShpOrderRequestStatus = 'PENDING' | 'APPROVED' | 'DECLINED' | 'WITHDRAWN'

export type ShpOrderRequest = {
  id: string
  orderId: string
  memberId: string | null
  type: ShpOrderRequestType
  status: ShpOrderRequestStatus
  /** Code from SHP_REQUEST_REASONS, not free text. */
  reason: string
  customerNote: string | null
  /** Shown to the customer with the decision. */
  adminNote: string | null
  decidedAt: Date | null
  decidedBy: string | null
  createdAt: Date
  updatedAt: Date
}

/** Empty on a CANCEL: it covers the whole order, and "everything" is not a list. */
export type ShpOrderRequestItem = { id: string; requestId: string; orderItemId: string; quantity: number }

export type ShpOrderRequestWithItems = ShpOrderRequest & { items: ShpOrderRequestItem[] }

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

// One line of a signed-in shopper's saved basket. Deliberately the same shape
// the browser keeps in localStorage (see components/public/cart.ts): the server
// stores the shopping list verbatim and reads nothing out of `meta`, so a
// companion module that puts its own state on a line gets it back untouched on
// the shopper's other device.
export type ShpMemberCartLine = {
  productId: string
  quantity: number
  lineId?: string
  meta?: Record<string, unknown>
}

export type ShpMemberCart = {
  memberId: string
  lines: ShpMemberCartLine[]
  updatedAt: Date
}

/** The same basket, for a shopper who is not signed in. Keyed on the id in the
 *  shop's own basket cookie rather than on a person, and holding lines and
 *  nothing else - see migrations/026_guest_carts.sql. */
export type ShpGuestCart = {
  cartId: string
  lines: ShpMemberCartLine[]
  updatedAt: Date
}

export type ShpEmailTemplateTrigger =
  | 'ORDER_CONFIRMED' | 'STATUS_PROCESSING' | 'STATUS_SHIPPED' | 'STATUS_COMPLETED' | 'STATUS_CANCELLED'
  // Sent per shipment when only some of an order's lines have gone out.
  // STATUS_SHIPPED says the whole order is on its way, so it cannot stand in
  // for this one. See lib/shipment-email.ts.
  | 'PARTIAL_SHIPPED'
  | 'ADMIN_NEW_ORDER' | 'LOW_STOCK' | 'BACK_IN_STOCK' | 'IMPORT_COMPLETE'
  // Cancel / return requests. See lib/order-request-actions.ts.
  | 'REQUEST_RECEIVED' | 'REQUEST_APPROVED' | 'REQUEST_DECLINED' | 'ADMIN_NEW_REQUEST'
  // The credit note raised when a refund goes through. See lib/credit-notes.ts.
  | 'CREDIT_NOTE_ISSUED'
// ShpEmailTemplate is gone: the shop's email copy lives in core's single email
// registry now (lib/email-templates.ts + the manifest's `emailTemplates` entry),
// edited in Settings > Emails alongside every other email the site sends. The
// trigger names above stay - they are the shop's own vocabulary at every call
// site and in the order email log.

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
