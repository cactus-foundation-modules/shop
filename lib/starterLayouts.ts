// Starter layout templates for the shopIndex/shopCategory/shopCollection/
// shopProduct/shopCheckout/shopConfirmation layout types, collected by
// scripts/generate-module-layout-types.mjs (core) via this module's
// cactus.module.json layoutTypes.types[].starterImport/starterExport.
//
// index/product/checkout/confirmation have no hardcoded fallback page (they
// were Puck-only from day one, formerly via the single-layout shp_page_layouts
// table) - so exactly one template per type is marked publishByDefault so the
// storefront keeps working out of the box, mirroring core's header/footer
// starters. category/collection are new: they DO have a hardcoded fallback
// grid, so all three of their templates seed as drafts only, same as
// Directory/Gazette/Boards - the site owner opts in by publishing one.

const block = (type: string, id: string, props: Record<string, unknown> = {}) => ({ type, props: { id, ...props } })

const split = (id: string, ratio: string, props: Record<string, unknown> = {}) => ({ type: 'Split', props: { id, ratio, align: 'stretch', gap: 'lg', padding: 'none', ...props } })

const section = (id: string, overrides: Record<string, unknown> = {}) => ({
  type: 'Section',
  props: {
    id, bgType: 'none', bgColor: '', bgImage: '', bgSize: 'cover',
    overlayColor: '', overlayOpacity: 0, paddingY: 'md', maxWidth: 'standard',
    textColor: '', sticky: 'off', stickyOffset: '0px', boxShadow: 'none',
    borderStyle: 'none', borderColor: 'var(--color-border)', borderWidth: '1px',
    borderRadius: 'none', opacity: '100',
    animationType: 'none', animationDuration: 'normal', animationDelay: 'none',
    content: [],
    ...overrides,
  },
})

// ---------------------------------------------------------------------------
// Shop Home templates (3) - shopIndex
// ---------------------------------------------------------------------------

export function shopIndexStarters() {
  return [
    {
      id: 'starter-shop-index-classic',
      name: 'Classic Grid',
      description: 'Just the full catalogue, three columns, with filters.',
      publishByDefault: true,
      data: {
        content: [block('ShopProductGrid', 'shop-index-grid', { columns: 3, limit: 12, showFilters: 'yes' })],
        root: { props: {} },
        zones: {},
      },
    },
    {
      id: 'starter-shop-index-hero',
      name: 'Hero Banner + Categories',
      description: 'Promo banner up top, then a category browser, then the catalogue.',
      data: {
        content: [
          block('ShopPromoBanner', 'banner-1', { heading: 'New season, just landed', body: 'Have a look through what just came in.', ctaLabel: 'Shop now', ctaHref: '/shop', backgroundColour: 'surface-muted' }),
          block('ShopCategoryBrowser', 'categories-1', { columns: 4 }),
          block('ShopProductGrid', 'grid-1', { columns: 3, limit: 9, showFilters: 'no' }),
        ],
        root: { props: {} },
        zones: {},
      },
    },
    {
      id: 'starter-shop-index-featured',
      name: 'Featured Collections',
      description: 'Leads with a featured collection, catalogue grid below.',
      data: {
        content: [
          block('ShopFeaturedCollection', 'featured-1', { collectionSlug: '', layout: 'Grid', limit: 4 }),
          block('ShopProductGrid', 'grid-1', { columns: 3, limit: 12, showFilters: 'yes' }),
        ],
        root: { props: {} },
        zones: {},
      },
    },
  ]
}

// ---------------------------------------------------------------------------
// Category templates (3) - shopCategory (new - was hardcoded before)
// ---------------------------------------------------------------------------

export function shopCategoryStarters() {
  return [
    {
      id: 'starter-shop-category-sidebar',
      name: 'Grid with Sidebar',
      description: 'Header, then products on the left (70%) with a promo panel on the right (30%).',
      data: {
        content: [
          block('ShopCategoryHeader', 'header-1'),
          split('columns-1', '70/30'),
        ],
        root: { props: {} },
        zones: {
          'columns-1:left': [block('ShopProductGrid', 'grid-1', { columns: 2, limit: 12, showFilters: 'no' })],
          'columns-1:right': [block('ShopPromoBanner', 'banner-1', { heading: 'Bundle & save', body: 'Buy more, save more on this range.', ctaLabel: 'See offers', ctaHref: '/shop', backgroundColour: 'surface-muted' })],
        },
      },
    },
    {
      id: 'starter-shop-category-banner',
      name: 'Full Width with Banner',
      description: 'Header, full-width promo banner, then a full-width product grid.',
      data: {
        content: [
          block('ShopCategoryHeader', 'header-1'),
          block('ShopPromoBanner', 'banner-1', { heading: 'This week in this category', body: '', ctaLabel: 'Shop the range', ctaHref: '/shop', backgroundColour: 'surface-muted' }),
          block('ShopProductGrid', 'grid-1', { columns: 3, limit: 12, showFilters: 'yes' }),
        ],
        root: { props: {} },
        zones: {},
      },
    },
    {
      id: 'starter-shop-category-subcategories',
      name: 'Sub-categories First',
      description: 'Header, then this category\'s sub-categories as cards, its description, and finally the products - built for a category that is really a set of smaller ones.',
      data: {
        content: [
          block('ShopCategoryHeader', 'header-1'),
          block('ShopCategoryBrowser', 'subcategories-1', { parentCategorySlug: '', columns: 3, ctaLabel: 'Browse' }),
          block('ShopCategoryDescription', 'description-1'),
          block('ShopProductGrid', 'grid-1', { columns: 3, limit: 12, showFilters: 'yes' }),
        ],
        root: { props: {} },
        zones: {},
      },
    },
    {
      id: 'starter-shop-category-compact',
      name: 'Compact List',
      description: 'Narrow boxed header, dense product grid, no distractions.',
      data: {
        content: [
          section('section-1', { maxWidth: 'narrow', content: [block('ShopCategoryHeader', 'header-1')] }),
          block('ShopProductGrid', 'grid-1', { columns: 4, limit: 16, showFilters: 'yes' }),
        ],
        root: { props: {} },
        zones: {},
      },
    },
  ]
}

// ---------------------------------------------------------------------------
// Collection templates (3) - shopCollection (new - was hardcoded before)
// ---------------------------------------------------------------------------

export function shopCollectionStarters() {
  return [
    {
      id: 'starter-shop-collection-hero',
      name: 'Hero Collection',
      description: 'Big header, full-width feature banner, then the collection grid - built for a curated, seasonal feel.',
      data: {
        content: [
          block('ShopCollectionHeader', 'header-1'),
          block('ShopPromoBanner', 'banner-1', { heading: 'Handpicked for you', body: '', ctaLabel: '', ctaHref: '/shop', backgroundColour: 'surface-muted' }),
          block('ShopProductGrid', 'grid-1', { columns: 3, limit: 12, showFilters: 'no' }),
        ],
        root: { props: {} },
        zones: {},
      },
    },
    {
      id: 'starter-shop-collection-sidebar',
      name: 'Grid with Sidebar',
      description: 'Header, then the collection grid (70%) with a single pinned product spotlighted on the right (30%).',
      data: {
        content: [
          block('ShopCollectionHeader', 'header-1'),
          split('columns-1', '70/30'),
        ],
        root: { props: {} },
        zones: {
          'columns-1:left': [block('ShopProductGrid', 'grid-1', { columns: 2, limit: 12, showFilters: 'no' })],
          'columns-1:right': [block('ShopProductCard', 'pinned-1', { productSlug: '' })],
        },
      },
    },
    {
      id: 'starter-shop-collection-compact',
      name: 'Compact List',
      description: 'Narrow boxed header, dense product grid, no banner.',
      data: {
        content: [
          section('section-1', { maxWidth: 'narrow', content: [block('ShopCollectionHeader', 'header-1')] }),
          block('ShopProductGrid', 'grid-1', { columns: 4, limit: 16, showFilters: 'no' }),
        ],
        root: { props: {} },
        zones: {},
      },
    },
  ]
}

// ---------------------------------------------------------------------------
// Tag templates (2) - shopTag
//
// One layout serves every tag: the page fills in which tag each block is looking
// at (lib/inject-tag-context.ts), so no starter carries a slug. Two rather than
// three - a tag page is a heading and a list of things, and a tag has no
// sub-tags to lead with the way a category has sub-categories.
// ---------------------------------------------------------------------------

export function shopTagStarters() {
  return [
    {
      id: 'starter-shop-tag-grid',
      name: 'Header and Grid',
      description: 'The tag\'s name and description, then everything carrying it in a three-across grid.',
      data: {
        content: [
          block('ShopTagHeader', 'header-1'),
          block('ShopProductGrid', 'grid-1', { columns: 3, limit: 24, showFilters: 'no' }),
        ],
        root: { props: {} },
        zones: {},
      },
    },
    {
      id: 'starter-shop-tag-banner',
      name: 'With a Banner',
      description: 'Header, a full-width panel for whatever the offer is, then the products - built for a sale or a seasonal push.',
      data: {
        content: [
          block('ShopTagHeader', 'header-1'),
          block('ShopPromoBanner', 'banner-1', { heading: 'While it lasts', body: '', ctaLabel: '', ctaHref: '/shop', backgroundColour: 'surface-muted' }),
          block('ShopProductGrid', 'grid-1', { columns: 3, limit: 24, showFilters: 'no' }),
        ],
        root: { props: {} },
        zones: {},
      },
    },
  ]
}

// ---------------------------------------------------------------------------
// Product templates (3) - shopProduct
// ---------------------------------------------------------------------------

export function shopProductStarters() {
  return [
    {
      id: 'starter-shop-product-classic',
      name: 'Classic Detail',
      description: 'Product detail, back-in-stock form, related products below.',
      publishByDefault: true,
      data: {
        content: [
          block('ShopProductDetail', 'shop-product-detail'),
          block('ShopBackInStockForm', 'shop-product-backinstock', { buttonLabel: 'Notify me' }),
          block('ShopRelatedProducts', 'shop-product-related', { heading: 'You might also like', layout: 'Grid' }),
        ],
        root: { props: {} },
        zones: {},
      },
    },
    {
      id: 'starter-shop-product-sidebar',
      name: 'With Upsells Sidebar',
      description: 'Product detail (70%) with back-in-stock and upsells in a sidebar (30%), related products full-width below.',
      data: {
        content: [
          split('columns-1', '70/30'),
          block('ShopRelatedProducts', 'related-1', { heading: 'You might also like', layout: 'Grid' }),
        ],
        root: { props: {} },
        zones: {
          'columns-1:left': [block('ShopProductDetail', 'detail-1')],
          'columns-1:right': [block('ShopBackInStockForm', 'backinstock-1', { buttonLabel: 'Notify me' }), block('ShopUpsellProducts', 'upsells-1', { heading: 'Goes well with', layout: 'Grid' })],
        },
      },
    },
    {
      id: 'starter-shop-product-hero',
      name: 'Full Width Hero then Details',
      description: 'Full-width product detail, boxed back-in-stock form, related and upsell products stacked below.',
      data: {
        content: [
          block('ShopProductDetail', 'detail-1'),
          section('section-1', { content: [block('ShopBackInStockForm', 'backinstock-1', { buttonLabel: 'Notify me' })] }),
          block('ShopRelatedProducts', 'related-1', { heading: 'You might also like', layout: 'Grid' }),
          block('ShopUpsellProducts', 'upsells-1', { heading: 'Goes well with', layout: 'Grid' }),
        ],
        root: { props: {} },
        zones: {},
      },
    },
  ]
}

// ---------------------------------------------------------------------------
// Checkout templates (3) - shopCheckout
// ---------------------------------------------------------------------------

export function shopCheckoutStarters() {
  return [
    {
      id: 'starter-shop-checkout-classic',
      name: 'Classic Steps',
      description: 'Order summary up top, then contact, shipping, payment, review, and a final upsell - one centred column.',
      publishByDefault: true,
      data: {
        // Inside a narrow Section so the single column stays centred and tidy
        // now the page wrapper is wide enough for two-column designs.
        content: [section('shop-checkout-section', {
          maxWidth: 'narrow',
          content: [
            block('ShopCheckoutItems', 'shop-checkout-items'),
            block('ShopCheckoutContact', 'shop-checkout-contact'),
            block('ShopCheckoutShipping', 'shop-checkout-shipping'),
            block('ShopCheckoutPayment', 'shop-checkout-payment'),
            block('ShopCheckoutReview', 'shop-checkout-review'),
            block('ShopUpsellProducts', 'shop-checkout-upsells', { heading: 'You might also like', layout: 'Grid' }),
          ],
        })],
        root: { props: {} },
        zones: {},
      },
    },
    {
      id: 'starter-shop-checkout-sidebar',
      name: 'Two Column',
      description: 'Order summary on the left (40%) staying in view as the page scrolls, the checkout steps on the right (60%), suggestions underneath.',
      data: {
        // The summary has its column to itself so `sticky` can hold it in view
        // beside the scrolling steps - a sibling below it in the same zone
        // would be ridden over. Upsells go full-width under the split instead.
        content: [
          // On a phone the columns stack, and the summary column would land on
          // top - burying the first field under the whole basket. 'right-first'
          // puts the steps above it there; the desktop order is unchanged.
          split('columns-1', '40/60', { stackOrder: 'right-first' }),
          block('ShopUpsellProducts', 'upsells-1', { heading: 'Add to your order', layout: 'Grid' }),
        ],
        root: { props: {} },
        zones: {
          'columns-1:left': [
            block('ShopCheckoutItems', 'items-1', { sticky: 'on', stickyOffset: '1rem' }),
          ],
          'columns-1:right': [
            block('ShopCheckoutContact', 'contact-1'),
            block('ShopCheckoutShipping', 'shipping-1'),
            block('ShopCheckoutPayment', 'payment-1'),
            block('ShopCheckoutReview', 'review-1'),
          ],
        },
      },
    },
    {
      id: 'starter-shop-checkout-compact',
      name: 'Compact Single Column',
      description: 'Narrow, boxed, no upsells - just the steps, for the fastest possible checkout.',
      data: {
        content: [section('section-1', {
          maxWidth: 'narrow',
          content: [
            block('ShopCheckoutItems', 'items-1'),
            block('ShopCheckoutContact', 'contact-1'),
            block('ShopCheckoutShipping', 'shipping-1'),
            block('ShopCheckoutPayment', 'payment-1'),
            block('ShopCheckoutReview', 'review-1'),
          ],
        })],
        root: { props: {} },
        zones: {},
      },
    },
  ]
}

// ---------------------------------------------------------------------------
// Confirmation templates (3) - shopConfirmation
// ---------------------------------------------------------------------------

export function shopConfirmationStarters() {
  return [
    {
      id: 'starter-shop-confirmation-classic',
      name: 'Simple Confirmation',
      description: 'Just the order confirmation - order number, summary, and what happens next.',
      publishByDefault: true,
      data: {
        content: [block('ShopOrderConfirmation', 'shop-order-confirmation')],
        root: { props: {} },
        zones: {},
      },
    },
    {
      id: 'starter-shop-confirmation-recommendations',
      name: 'With Recommendations',
      description: 'Order confirmation, then a nudge to keep browsing while they wait for delivery.',
      data: {
        content: [
          block('ShopOrderConfirmation', 'confirmation-1'),
          block('ShopUpsellProducts', 'upsells-1', { heading: 'While you wait, take a look at...', layout: 'Grid' }),
        ],
        root: { props: {} },
        zones: {},
      },
    },
    {
      id: 'starter-shop-confirmation-boxed',
      name: 'Boxed Minimal',
      description: 'Narrow, centred, distraction-free - just the confirmation, nothing else competing for attention.',
      data: {
        content: [section('section-1', { maxWidth: 'narrow', paddingY: 'lg', content: [block('ShopOrderConfirmation', 'confirmation-1')] })],
        root: { props: {} },
        zones: {},
      },
    },
  ]
}

// ---------------------------------------------------------------------------
// Cart templates (3) - shopCart
// ---------------------------------------------------------------------------
// The cart page (/shop/cart) keeps its original hardcoded cart as a fallback,
// so like category/collection it would be safe to seed all-draft. But the whole
// point of the Cart block is to make the basket designable out of the box, so
// exactly one template is publishByDefault: it publishes the full Cart block +
// an upsell row, matching the old hardcoded look closely while being editable.

export function shopCartStarters() {
  return [
    {
      id: 'starter-shop-cart-classic',
      name: 'Classic Cart',
      description: 'The full cart - items, quantity, coupon and totals - with a row of suggestions underneath.',
      publishByDefault: true,
      data: {
        content: [
          block('ShopCartFull', 'shop-cart-full'),
          block('ShopUpsellProducts', 'shop-cart-upsells', { heading: 'You might also like', layout: 'Grid' }),
        ],
        root: { props: {} },
        zones: {},
      },
    },
    {
      id: 'starter-shop-cart-sidebar',
      name: 'Two Column',
      description: 'Your items on the left (70%), suggested extras in a sidebar on the right (30%).',
      data: {
        content: [split('columns-1', '70/30')],
        root: { props: {} },
        zones: {
          'columns-1:left': [block('ShopCartFull', 'cart-1', { maxWidth: 0 })],
          'columns-1:right': [block('ShopUpsellProducts', 'upsells-1', { heading: 'Add to your order', layout: 'Grid' })],
        },
      },
    },
    {
      id: 'starter-shop-cart-cards',
      name: 'Card List',
      description: 'Each item in its own card, centred in a narrow column - clean and uncluttered, no upsells.',
      data: {
        content: [section('section-1', { maxWidth: 'narrow', content: [block('ShopCartFull', 'cart-1', { layoutStyle: 'cards', maxWidth: 0 })] })],
        root: { props: {} },
        zones: {},
      },
    },
  ]
}

// ---------------------------------------------------------------------------
// Product Detail templates (3) - shopProductDetail (block-internal layout)
// ---------------------------------------------------------------------------
// The parts (Gallery/Badges/Title/Price/Add to Cart/Tabs...) are the draggable
// pieces of the product detail area; the two-column structure comes from a
// Split, not a hardcoded grid. Add to Cart cannot be deleted (it's the anchor).
//
// Default's Split is on the `auto` ratio rather than a fixed fraction: the photo
// is square and sizes itself against the viewport, so the gallery column hugs
// whatever width the photo settled on and the buy column takes the rest. A fixed
// fraction left the photo centred in a column too wide for it.

const detailSplit = (id: string, ratio: string) => ({ type: 'Split', props: { id, ratio, align: 'start', gap: 'lg', padding: 'none' } })

export function shopProductDetailStarters() {
  return [
    {
      id: 'starter-shop-detail-default',
      name: 'Default',
      description: 'The classic two-column product page: gallery on the left, buy column on the right, tabs below.',
      publishByDefault: true,
      data: {
        content: [detailSplit('pdp-cols', 'auto'), block('ShopDetailTabs', 'pdp-tabs'), block('ShopDetailSections', 'pdp-sections', { display: 'stacked', divider: 'no' })],
        root: { props: {} },
        zones: {
          'pdp-cols:left': [block('ShopDetailGallery', 'pdp-gallery', { thumbPosition: 'below' })],
          'pdp-cols:right': [
            block('ShopDetailBadges', 'pdp-badges'),
            block('ShopDetailTitle', 'pdp-title'),
            block('ShopDetailSku', 'pdp-sku'),
            block('ShopDetailPrice', 'pdp-price', { showCompare: 'yes', showSave: 'yes' }),
            block('ShopDetailBlurb', 'pdp-blurb'),
            block('ShopDetailPreorder', 'pdp-preorder'),
            block('ShopDetailAddToCart', 'pdp-add', { showStepper: 'yes' }),
            block('ShopDetailReassure', 'pdp-reassure', { reassure1: 'Free delivery over £50', reassure2: '30-day returns', reassure3: '2-year guarantee' }),
          ],
        },
      },
    },
    {
      id: 'starter-shop-detail-editorial',
      name: 'Editorial',
      description: 'Image-led: a big photo up top with thumbnails beside it, the buy details in a boxed column below, then tabs.',
      data: {
        content: [
          block('ShopDetailGallery', 'gallery-1', { thumbPosition: 'beside' }),
          section('section-1', {
            maxWidth: 'narrow',
            content: [
              block('ShopDetailBadges', 'badges-1'),
              block('ShopDetailTitle', 'title-1'),
              block('ShopDetailPrice', 'price-1', { showCompare: 'yes', showSave: 'yes' }),
              block('ShopDetailBlurb', 'blurb-1'),
              block('ShopDetailPreorder', 'preorder-1'),
              block('ShopDetailAddToCart', 'add-1', { showStepper: 'yes' }),
              block('ShopDetailReassure', 'reassure-1', { reassure1: 'Free delivery over £50', reassure2: '30-day returns', reassure3: '2-year guarantee' }),
            ],
          }),
          block('ShopDetailTabs', 'tabs-1'),
          block('ShopDetailSections', 'sections-1', { display: 'stacked', divider: 'no' }),
        ],
        root: { props: {} },
        zones: {},
      },
    },
    {
      id: 'starter-shop-detail-compact',
      name: 'Compact',
      description: 'Single narrow column, everything stacked, a full-width buy button - built for a fast, focused decision.',
      data: {
        content: [
          section('section-1', {
            maxWidth: 'narrow',
            content: [
              block('ShopDetailGallery', 'gallery-1', { thumbPosition: 'below' }),
              block('ShopDetailBadges', 'badges-1'),
              block('ShopDetailTitle', 'title-1'),
              block('ShopDetailPrice', 'price-1', { showCompare: 'yes', showSave: 'yes' }),
              block('ShopDetailAddToCart', 'add-1', { showStepper: 'no' }),
              block('ShopDetailBlurb', 'blurb-1'),
              block('ShopDetailTabs', 'tabs-1'),
              block('ShopDetailSections', 'sections-1', { display: 'stacked', divider: 'no' }),
            ],
          }),
        ],
        root: { props: {} },
        zones: {},
      },
    },
  ]
}

// ---------------------------------------------------------------------------
// Product Card templates (3) - shopProductCard (block-internal layout)
// ---------------------------------------------------------------------------
// A card is a flat list of parts; the overall look (image on top / beside /
// filling the card) follows from the Image part's own display option, so it
// survives a re-save. Every card surface stamps this template per product.

export function shopProductCardStarters() {
  return [
    {
      id: 'starter-shop-card-standard',
      name: 'Standard',
      description: 'Image on top, then name, price and a spec link - the familiar catalogue card.',
      publishByDefault: true,
      data: {
        content: [
          block('ShopCardImage', 'card-img', { display: 'standard' }),
          block('ShopCardBadge', 'card-badge'),
          block('ShopCardName', 'card-name'),
          block('ShopCardPrice', 'card-price', { showCompare: 'yes' }),
          block('ShopCardBlurb', 'card-blurb'),
          block('ShopCardCta', 'card-cta', { label: 'Full spec' }),
        ],
        root: { props: {} },
        zones: {},
      },
    },
    {
      id: 'starter-shop-card-overlay',
      name: 'Overlay',
      description: 'A tall image fills the card, with the name and price floating over the bottom.',
      data: {
        content: [
          block('ShopCardImage', 'card-img', { display: 'fill' }),
          block('ShopCardBadge', 'card-badge'),
          block('ShopCardName', 'card-name'),
          block('ShopCardPrice', 'card-price', { showCompare: 'yes' }),
        ],
        root: { props: {} },
        zones: {},
      },
    },
    {
      id: 'starter-shop-card-horizontal',
      name: 'Horizontal',
      description: 'Image on the left, details on the right - a list-style row that reads well in tight spaces.',
      data: {
        content: [
          block('ShopCardImage', 'card-img', { display: 'beside' }),
          block('ShopCardName', 'card-name'),
          block('ShopCardPrice', 'card-price', { showCompare: 'yes' }),
          block('ShopCardBlurb', 'card-blurb'),
          block('ShopCardCta', 'card-cta', { label: 'View' }),
        ],
        root: { props: {} },
        zones: {},
      },
    },
  ]
}

// ---------------------------------------------------------------------------
// Invoice document templates (3) - shopInvoice
// ---------------------------------------------------------------------------
//
// One publishes by default, because this layout IS the invoice: the page, the
// PDF and the link the customer follows all render it, and a shop that switched
// invoicing on and found a blank page would reasonably call it broken.
//
// It is also the fallback when nothing is published at all - see
// INVOICE_FALLBACK_DATA below and lib/invoice-document.tsx. That matters on an
// existing install: layout starters are seeded when a module is first installed,
// so a shop that has had this module for a year never gets this type seeded at
// all, and an invoice must still come out looking like an invoice.

// The letterhead: core's own Site Logo block, sitting above the heading. It is
// core's rather than the module's so that every document on the site draws the
// same logo the same way, and so an owner can move it, resize it or drop it for
// a picture of their own without a field on the heading block.
//
// showIcon off: a shop that has uploaded no logo should print its own name, not
// the Cactus mark. cellHeight 56 is the height the invoice logo has always been.
const INVOICE_LOGO = block('SiteLogo', 'inv-logo', {
  homeUrl: '/', imageUrl: '', imageUrlDark: '', align: 'left',
  cellHeight: 56, showTextWithLogo: 'false', showIcon: 'false', textColor: '',
})

const INVOICE_HEADER = block('ShopInvoiceHeader', 'inv-head', {
  heading: '', fontFamily: '',
  showOrderNumber: 'yes', showTaxPoint: 'no', taxPointLabel: 'Tax point',
})
const INVOICE_PARTIES = block('ShopInvoiceParties', 'inv-parties', {
  fontFamily: '', showFrom: 'yes', fromLabel: 'From', toLabel: 'Invoice to',
  showDelivery: 'yes', deliverLabel: 'Delivered to', showRegistration: 'yes',
})
const INVOICE_LINES = block('ShopInvoiceLines', 'inv-lines', {
  fontFamily: '', showSku: 'no', showDetail: 'yes', showTaxRate: 'no',
  itemLabel: 'Description', qtyLabel: 'Qty', priceLabel: 'Unit price', rateLabel: 'Rate', totalLabel: 'Amount',
})
const INVOICE_TOTALS = block('ShopInvoiceTotals', 'inv-totals', {
  fontFamily: '', subtotalLabel: 'Subtotal', discountLabel: 'Discount', deliveryLabel: 'Delivery',
  taxLabel: '', totalLabel: 'Total', showPaid: 'yes', paidWording: 'Paid in full - thank you.',
})
const INVOICE_TAX = block('ShopInvoiceTaxSummary', 'inv-tax', {
  fontFamily: '', heading: '', rateLabel: 'Rate', netLabel: 'Net', taxLabel: '', grossLabel: 'Gross',
  hideWhenSingleZero: 'yes',
})
const INVOICE_PAYMENT = block('ShopInvoicePayment', 'inv-pay', {
  fontFamily: '', showPaymentDetails: 'yes', paymentHeading: 'Payment',
  showTerms: 'yes', termsHeading: 'Terms', showFooter: 'yes', footerAlign: 'center',
})

// The designed invoice: an accent rule under the heading, a notice panel before
// the figures, a banded item table, the total set large above an accent rule,
// payment and terms side by side and a proper company footer.
//
// Its colours are site tokens, not values - `var(--color-primary)` for the
// accent and `var(--color-bg-subtle)` for the bands. So the template is the
// SHAPE of a designed invoice, drawn in whatever colours the site already uses,
// and an owner who wants their own accent changes one field on the style block
// rather than six blocks' worth of them.

const INVOICE_STYLE = block('ShopInvoiceStyle', 'inv-style', {
  accent: 'var(--color-primary)',
  labelColour: 'var(--color-primary)',
  titleColour: '',
  tableHeadBg: 'var(--color-bg-subtle)', tableHeadInk: '',
  panelBg: 'var(--color-bg-subtle)', panelInk: '', zebraBg: '',
  ruleWeight: 'thick', corners: 'square', density: 'normal',
  bodyFont: '', headingFont: '',
})

const INVOICE_DESIGNED = [
  INVOICE_STYLE,
  block('SiteLogo', 'inv-logo', {
    homeUrl: '/', imageUrl: '', imageUrlDark: '', align: 'left',
    cellHeight: 76, showTextWithLogo: 'false', showIcon: 'false', textColor: '',
  }),
  block('ShopInvoiceHeader', 'inv-head', {
    heading: '', fontFamily: '', titleSize: 'display', sides: 'logo-left', rule: 'accent',
    factsLayout: 'stacked', numberStyle: 'lead',
    invoiceLabel: 'Invoice', showOrderNumber: 'no', orderLabel: 'Order',
    dateLabel: 'Issued', dueLabel: 'Due',
    showTaxPoint: 'yes', taxPointLabel: 'Tax point',
  }),
  block('ShopInvoiceParties', 'inv-parties', {
    fontFamily: '', order: 'to-first', columns: '2',
    showFrom: 'yes', fromLabel: 'From', toLabel: 'Invoice to',
    showDelivery: 'yes', deliverLabel: 'Delivered to', showEmail: 'yes', showRegistration: 'no',
  }),
  block('ShopInvoiceNotice', 'inv-notice', {
    lead: 'Payment is due by {{DUE_DATE}}.',
    body: 'Order {{ORDER_NUMBER}}, invoiced {{INVOICE_DATE}}. Please quote the invoice number on any payment or query.',
    panelStyle: 'panel', hideWhenEmpty: 'yes', fontFamily: '',
  }),
  block('ShopInvoiceLines', 'inv-lines', {
    fontFamily: '', headStyle: 'filled', rowRules: 'every', zebra: 'no',
    showSku: 'yes', showDetail: 'yes', showTaxRate: 'no',
    itemLabel: 'Item', qtyLabel: 'Qty', priceLabel: 'Unit ex VAT', rateLabel: 'Rate', totalLabel: 'Total ex VAT',
  }),
  block('ShopInvoiceTotals', 'inv-totals', {
    fontFamily: '', emphasis: 'accent', width: 'normal',
    subtotalLabel: 'Subtotal ex VAT', discountLabel: 'Discount', deliveryLabel: 'Delivery ex VAT',
    showDeliveryRow: 'always', zeroDelivery: 'Free',
    taxLabel: '', showTaxRate: 'yes', totalLabel: 'Total',
    showPaid: 'no', paidWording: 'Paid in full - thank you.',
  }),
  // Left in and set to appear only where it earns its place. A shop selling at
  // one rate has said everything in the totals row above; a shop selling at two
  // gets the table back without anybody remembering to switch it on.
  block('ShopInvoiceTaxSummary', 'inv-tax', {
    fontFamily: '', heading: '', headStyle: 'filled', align: 'right',
    rateLabel: 'Rate', netLabel: 'Net', taxLabel: '', grossLabel: 'Gross',
    hideWhenSingleZero: 'single',
  }),
  block('ShopInvoicePayment', 'inv-pay', {
    fontFamily: '', columns: '2',
    showPaymentDetails: 'yes', paymentHeading: 'How to pay', paymentExtra: '',
    showTerms: 'yes', termsHeading: 'Terms', termsExtra: '',
    showFooter: 'no', footerAlign: 'center',
  }),
  block('ShopInvoiceFooter', 'inv-footer', {
    contact: '{{SITE_URL}} · {{BUSINESS_EMAIL}}',
    smallPrint: '{{BUSINESS_NAME}}, registered in England and Wales, company number {{COMPANY_NUMBER}}. VAT number {{VAT_NUMBER}}.\nRegistered office: {{BUSINESS_ADDRESS}}.',
    align: 'center', rule: 'yes', fontFamily: '',
  }),
]

/** What an invoice renders as when no layout of this type is published. Kept in
 *  step with the standard template below by being the same blocks. */
export const INVOICE_FALLBACK_DATA = {
  content: [INVOICE_LOGO, INVOICE_HEADER, INVOICE_PARTIES, INVOICE_LINES, INVOICE_TOTALS, INVOICE_TAX, INVOICE_PAYMENT],
  root: { props: {} },
  zones: {},
}

export function shopInvoiceStarters() {
  return [
    {
      id: 'starter-shop-invoice-standard',
      name: 'Standard invoice',
      description: 'Heading, both addresses, the items, the totals, a tax summary and your payment terms - in the order an accountant reads them.',
      publishByDefault: true,
      data: {
        content: [INVOICE_LOGO, INVOICE_HEADER, INVOICE_PARTIES, INVOICE_LINES, INVOICE_TOTALS, INVOICE_TAX, INVOICE_PAYMENT],
        root: { props: {} },
        zones: {},
      },
    },
    {
      id: 'starter-shop-invoice-designed',
      name: 'Designed invoice',
      description: 'The same invoice, laid out properly: a rule in your own colour under the heading, the payment terms in a panel of their own, a banded item table and a company footer.',
      data: {
        content: INVOICE_DESIGNED,
        root: { props: {} },
        zones: {},
      },
    },
    {
      id: 'starter-shop-invoice-rates',
      name: 'Mixed rates',
      description: 'The same invoice with the tax rate against every line. For a shop selling at more than one rate.',
      data: {
        content: [
          INVOICE_LOGO,
          INVOICE_HEADER,
          INVOICE_PARTIES,
          block('ShopInvoiceLines', 'inv-lines', {
            fontFamily: '', showSku: 'no', showDetail: 'yes', showTaxRate: 'yes',
            itemLabel: 'Description', qtyLabel: 'Qty', priceLabel: 'Unit price', rateLabel: 'Rate', totalLabel: 'Amount',
          }),
          INVOICE_TOTALS,
          block('ShopInvoiceTaxSummary', 'inv-tax', {
            fontFamily: '', heading: '', rateLabel: 'Rate', netLabel: 'Net', taxLabel: '', grossLabel: 'Gross',
            hideWhenSingleZero: 'no',
          }),
          INVOICE_PAYMENT,
        ],
        root: { props: {} },
        zones: {},
      },
    },
    {
      id: 'starter-shop-invoice-plain',
      name: 'Plain',
      description: 'No logo, no delivery address, no tax table. For a shop that pays somebody to do its books and just needs the paperwork.',
      data: {
        content: [
          block('ShopInvoiceHeader', 'inv-head', {
            heading: '', fontFamily: '',
            showOrderNumber: 'yes', showTaxPoint: 'no', taxPointLabel: 'Tax point',
          }),
          block('ShopInvoiceParties', 'inv-parties', {
            fontFamily: '', showFrom: 'yes', fromLabel: 'From', toLabel: 'Invoice to',
            showDelivery: 'no', deliverLabel: 'Delivered to', showRegistration: 'yes',
          }),
          INVOICE_LINES,
          INVOICE_TOTALS,
          INVOICE_PAYMENT,
        ],
        root: { props: {} },
        zones: {},
      },
    },
  ]
}

// ---------------------------------------------------------------------------
// Proforma document templates (2) - shopProforma
// ---------------------------------------------------------------------------
//
// The invoice's blocks, on a layout type of their own, saying the things a
// request for payment says rather than the things a record of one says.
//
// A layout type of its own rather than a flag on the invoice, deliberately.
// These two documents disagree in half a dozen places at once - the heading, the
// number, whether there is a tax point, what the small print promises, whether
// lead times appear - and folding both onto one layout would mean every one of
// those was a condition an owner could not see in the editor. It would also mean
// editing the proforma risked the document their accountant reads, which is the
// last thing anybody wants to do by accident.
//
// What differs from the invoice starters, and why:
//
//  - The notice panel leads with {{PROFORMA_NOTICE}} - "this is not a VAT
//    invoice". Not decoration: a proforma that reads like an invoice is one a
//    customer will try to reclaim VAT on.
//  - No tax point, because there is not one. A proforma claims no tax point at
//    all - that is very nearly the definition of it.
//  - The document number leads and there is no separate order row, because the
//    number IS the order number and printing it twice under two labels would
//    read as two different references.
//  - The items show their options AND their delivery line, which on an unpaid
//    order reads as a lead time counted from the day the money clears. That is
//    the figure somebody deciding whether to pay is actually weighing up.
//  - "Not yet paid" under the total, not "Paid in full". The block picks the
//    real one from the order at render time; what is set here is what the editor
//    canvas shows, since the canvas has no order to read.

const PROFORMA_LOGO = block('SiteLogo', 'pro-logo', {
  homeUrl: '/', imageUrl: '', imageUrlDark: '', align: 'left',
  cellHeight: 56, showTextWithLogo: 'false', showIcon: 'false', textColor: '',
})

const PROFORMA_HEADER = block('ShopInvoiceHeader', 'pro-head', {
  heading: 'Proforma invoice', fontFamily: '',
  numberStyle: 'lead', invoiceLabel: 'Order', showOrderNumber: 'no', orderLabel: 'Order',
  dateLabel: 'Issued', dueLabel: 'Payment due', showTaxPoint: 'no',
})

const PROFORMA_NOTICE = block('ShopInvoiceNotice', 'pro-notice', {
  lead: '{{PROFORMA_NOTICE}}',
  body: 'Order {{ORDER_NUMBER}}, raised {{INVOICE_DATE}}. Please quote the order number with your payment.',
  panelStyle: 'panel', hideWhenEmpty: 'yes', fontFamily: '',
})

const PROFORMA_PARTIES = block('ShopInvoiceParties', 'pro-parties', {
  fontFamily: '', showFrom: 'yes', fromLabel: 'From', toLabel: 'Proforma to',
  showDelivery: 'yes', deliverLabel: 'Delivered to', showRegistration: 'yes',
  // Addressed to the business, not to whoever in it filled the form in. A
  // proforma goes to an accounts department, who file it under the company name
  // and will not thank you for a document addressed to a colleague.
  leadWith: 'organisation',
})

const PROFORMA_LINES = block('ShopInvoiceLines', 'pro-lines', {
  fontFamily: '', showSku: 'no', showDetail: 'yes', showTaxRate: 'no',
  itemLabel: 'Description', qtyLabel: 'Qty', priceLabel: 'Unit price', rateLabel: 'Rate', totalLabel: 'Amount',
})

const PROFORMA_TOTALS = block('ShopInvoiceTotals', 'pro-totals', {
  fontFamily: '', subtotalLabel: 'Subtotal', discountLabel: 'Discount', deliveryLabel: 'Delivery',
  taxLabel: '', totalLabel: 'Total due', showPaid: 'yes', paidWording: 'Not yet paid.',
})

const PROFORMA_TAX = block('ShopInvoiceTaxSummary', 'pro-tax', {
  fontFamily: '', heading: '', rateLabel: 'Rate', netLabel: 'Net', taxLabel: '', grossLabel: 'Gross',
  hideWhenSingleZero: 'yes',
})

const PROFORMA_PAYMENT = block('ShopInvoicePayment', 'pro-pay', {
  fontFamily: '', showPaymentDetails: 'yes', paymentHeading: 'How to pay',
  showTerms: 'yes', termsHeading: 'Before we dispatch', showFooter: 'yes', footerAlign: 'center',
})

const PROFORMA_STANDARD = [
  PROFORMA_LOGO, PROFORMA_HEADER, PROFORMA_NOTICE, PROFORMA_PARTIES,
  PROFORMA_LINES, PROFORMA_TOTALS, PROFORMA_TAX, PROFORMA_PAYMENT,
]

/** What a proforma renders as when no layout of this type is published. Kept in
 *  step with the standard template below by being the same blocks - which
 *  matters here more than it does for the invoice, because every shop that
 *  already has this module will have no `shopProforma` layout at all until
 *  somebody makes one. */
export const PROFORMA_FALLBACK_DATA = {
  content: PROFORMA_STANDARD,
  root: { props: {} },
  zones: {},
}

export function shopProformaStarters() {
  return [
    {
      id: 'starter-shop-proforma-standard',
      name: 'Standard proforma',
      description: 'What is owed, how to pay it, how long each item takes once you have - and, in as many words, that it is not a VAT invoice.',
      publishByDefault: true,
      data: {
        content: PROFORMA_STANDARD,
        root: { props: {} },
        zones: {},
      },
    },
    {
      id: 'starter-shop-proforma-designed',
      name: 'Designed proforma',
      description: 'The same document, laid out properly: a rule in your own colour, the not-a-VAT-invoice line in a panel of its own, a banded item table and a company footer.',
      data: {
        content: [
          INVOICE_STYLE,
          block('SiteLogo', 'pro-logo', {
            homeUrl: '/', imageUrl: '', imageUrlDark: '', align: 'left',
            cellHeight: 76, showTextWithLogo: 'false', showIcon: 'false', textColor: '',
          }),
          block('ShopInvoiceHeader', 'pro-head', {
            heading: 'Proforma invoice', fontFamily: '', titleSize: 'display', sides: 'logo-left', rule: 'accent',
            factsLayout: 'stacked', numberStyle: 'lead',
            invoiceLabel: 'Order', showOrderNumber: 'no', orderLabel: 'Order',
            dateLabel: 'Issued', dueLabel: 'Payment due', showTaxPoint: 'no',
          }),
          block('ShopInvoiceNotice', 'pro-notice', {
            lead: '{{PROFORMA_NOTICE}}',
            body: 'Order {{ORDER_NUMBER}}, raised {{INVOICE_DATE}}. Please quote the order number with your payment.',
            panelStyle: 'panel', hideWhenEmpty: 'yes', fontFamily: '',
          }),
          block('ShopInvoiceParties', 'pro-parties', {
            fontFamily: '', order: 'to-first', columns: '2',
            showFrom: 'yes', fromLabel: 'From', toLabel: 'Proforma to',
            showDelivery: 'yes', deliverLabel: 'Delivered to', showEmail: 'yes',
            leadWith: 'organisation', showRegistration: 'yes',
          }),
          block('ShopInvoiceLines', 'pro-lines', {
            fontFamily: '', headStyle: 'filled', rowRules: 'every', zebra: 'no',
            showSku: 'yes', showDetail: 'yes', showTaxRate: 'no',
            itemLabel: 'Item', qtyLabel: 'Qty', priceLabel: 'Unit ex VAT', rateLabel: 'Rate', totalLabel: 'Total ex VAT',
          }),
          block('ShopInvoiceTotals', 'pro-totals', {
            fontFamily: '', emphasis: 'accent', width: 'normal',
            subtotalLabel: 'Subtotal ex VAT', discountLabel: 'Discount', deliveryLabel: 'Delivery ex VAT',
            showDeliveryRow: 'always', zeroDelivery: 'Free',
            taxLabel: '', showTaxRate: 'yes', totalLabel: 'Total due',
            showPaid: 'yes', paidWording: 'Not yet paid.',
          }),
          block('ShopInvoiceTaxSummary', 'pro-tax', {
            fontFamily: '', heading: '', headStyle: 'filled', align: 'right',
            rateLabel: 'Rate', netLabel: 'Net', taxLabel: '', grossLabel: 'Gross',
            hideWhenSingleZero: 'single',
          }),
          block('ShopInvoicePayment', 'pro-pay', {
            fontFamily: '', columns: '2',
            showPaymentDetails: 'yes', paymentHeading: 'How to pay', paymentExtra: '',
            showTerms: 'yes', termsHeading: 'Before we dispatch', termsExtra: '',
            showFooter: 'no', footerAlign: 'center',
          }),
          block('ShopInvoiceFooter', 'pro-footer', {
            contact: '{{SITE_URL}} · {{BUSINESS_EMAIL}}',
            smallPrint: '{{BUSINESS_NAME}}, registered in England and Wales, company number {{COMPANY_NUMBER}}. VAT number {{VAT_NUMBER}}.\nRegistered office: {{BUSINESS_ADDRESS}}.',
            align: 'center', rule: 'yes', fontFamily: '',
          }),
        ],
        root: { props: {} },
        zones: {},
      },
    },
  ]
}

// ---------------------------------------------------------------------------
// PDF footer templates - shopInvoiceFooter, shopProformaFooter
// ---------------------------------------------------------------------------
//
// What repeats at the FOOT OF EVERY PAGE of the PDF, printed into the bottom
// margin by the browser rather than into the document. A footer block on the
// document itself is printed once, after the last line - which is right on a
// one-page invoice and wrong on a four-page one, where page two ends with a
// half-finished item table and nothing to say whose invoice it is.
//
// Nothing publishes by default. A shop that already has a footer block on its
// document would otherwise get the same words twice on page one, and a repeating
// footer is a decision an owner should make rather than find has been made.
//
// Two things to know when laying one out:
//
//  - it is drawn into the page's BOTTOM MARGIN, so the margin has to be deep
//    enough to hold it. That is a page setting on the document's own layout.
//  - the Page number block only says anything here. Its two figures are filled
//    in by the printing browser, which is the only thing that knows how many
//    pages the document turned into.

const PDF_FOOTER_RULE = block('ShopInvoiceDivider', 'pdf-foot-rule', {
  weight: 'hairline', weightPx: '', colour: '', width: 'full',
  spaceAbove: 'none', spaceAbovePx: '', spaceBelow: 'small', spaceBelowPx: '4px',
})

const PDF_FOOTER_ROOT = { align: 'stretch', inset: '0' }

function pdfFooterStarters(prefix: string, documentName: string) {
  return [
    {
      id: `starter-shop-${prefix}-footer-pages`,
      name: 'Page numbers',
      description: `"Page 2 of 3" at the foot of every page of the ${documentName} PDF, and nothing else.`,
      data: {
        content: [
          block('ShopInvoicePageNumber', `${prefix}-foot-pageno`, {
            text: 'Page {{PAGE}} of {{PAGES}}', align: 'center', fontFamily: '', colour: '',
          }),
        ],
        root: { props: PDF_FOOTER_ROOT },
        zones: {},
      },
    },
    {
      id: `starter-shop-${prefix}-footer-company`,
      name: 'Company footer',
      description: 'Your registration small print above a rule, with the page number beside it - on every page, the way headed paper does it.',
      data: {
        content: [
          PDF_FOOTER_RULE,
          block('ShopInvoiceFooter', `${prefix}-foot-company`, {
            contact: '',
            smallPrint: '{{BUSINESS_NAME}} · company number {{COMPANY_NUMBER}} · VAT {{VAT_NUMBER}}',
            align: 'center', rule: 'no', fontFamily: '',
          }),
          block('ShopInvoicePageNumber', `${prefix}-foot-pageno`, {
            text: '{{INVOICE_NUMBER}} · page {{PAGE}} of {{PAGES}}', align: 'center', fontFamily: '', colour: '',
          }),
        ],
        root: { props: PDF_FOOTER_ROOT },
        zones: {},
      },
    },
  ]
}

export function shopInvoiceFooterStarters() {
  return pdfFooterStarters('invoice', 'invoice')
}

export function shopProformaFooterStarters() {
  return pdfFooterStarters('proforma', 'proforma')
}
