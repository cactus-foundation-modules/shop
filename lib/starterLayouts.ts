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

const split = (id: string, ratio: string) => ({ type: 'Split', props: { id, ratio, align: 'stretch', gap: 'lg', padding: 'none' } })

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
      description: 'Contact, shipping, payment, review, and a final upsell - one column, top to bottom.',
      publishByDefault: true,
      data: {
        content: [
          block('ShopCheckoutContact', 'shop-checkout-contact'),
          block('ShopCheckoutShipping', 'shop-checkout-shipping'),
          block('ShopCheckoutPayment', 'shop-checkout-payment'),
          block('ShopCheckoutReview', 'shop-checkout-review'),
          block('ShopUpsellProducts', 'shop-checkout-upsells', { heading: 'You might also like', layout: 'Grid' }),
        ],
        root: { props: {} },
        zones: {},
      },
    },
    {
      id: 'starter-shop-checkout-sidebar',
      name: 'Two Column',
      description: 'Steps on the left (70%), upsell suggestions in a sidebar on the right (30%).',
      data: {
        content: [split('columns-1', '70/30')],
        root: { props: {} },
        zones: {
          'columns-1:left': [
            block('ShopCheckoutContact', 'contact-1'),
            block('ShopCheckoutShipping', 'shipping-1'),
            block('ShopCheckoutPayment', 'payment-1'),
            block('ShopCheckoutReview', 'review-1'),
          ],
          'columns-1:right': [block('ShopUpsellProducts', 'upsells-1', { heading: 'Add to your order', layout: 'Grid' })],
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
