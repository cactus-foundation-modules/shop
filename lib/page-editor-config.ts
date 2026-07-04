import type { ReactNode } from 'react'
import { shopProductGridPuckComponent } from '@/modules/shop/components/puck/ShopProductGrid'
import { shopFeaturedCollectionPuckComponent } from '@/modules/shop/components/puck/ShopFeaturedCollection'
import { shopCategoryBrowserPuckComponent } from '@/modules/shop/components/puck/ShopCategoryBrowser'
import { shopPromoBannerPuckComponent } from '@/modules/shop/components/puck/ShopPromoBanner'
import { shopProductDetailPuckComponent } from '@/modules/shop/components/puck/ShopProductDetail'
import { shopBackInStockFormPuckComponent } from '@/modules/shop/components/puck/ShopBackInStockForm'
import { shopRelatedProductsPuckComponent } from '@/modules/shop/components/puck/ShopRelatedProducts'
import { shopUpsellProductsPuckComponent } from '@/modules/shop/components/puck/ShopUpsellProducts'
import { shopCheckoutContactPuckComponent } from '@/modules/shop/components/puck/ShopCheckoutContact'
import { shopCheckoutShippingPuckComponent } from '@/modules/shop/components/puck/ShopCheckoutShipping'
import { shopCheckoutPaymentPuckComponent } from '@/modules/shop/components/puck/ShopCheckoutPayment'
import { shopCheckoutReviewPuckComponent } from '@/modules/shop/components/puck/ShopCheckoutReview'
import { shopOrderConfirmationPuckComponent } from '@/modules/shop/components/puck/ShopOrderConfirmation'

// Anchor blocks are locked (non-removable/non-duplicable) via Puck's
// per-component `permissions` - the four storefront templates each have a
// fixed structural core that mustn't be deleted, plus optional blocks the
// site owner can add/remove/reorder freely alongside them.
const ANCHOR: { permissions: { delete: false; duplicate: false } } = { permissions: { delete: false, duplicate: false } }

const PAGE_COMPONENTS = {
  index: {
    ShopProductGrid: { ...shopProductGridPuckComponent, ...ANCHOR },
    ShopFeaturedCollection: shopFeaturedCollectionPuckComponent,
    ShopCategoryBrowser: shopCategoryBrowserPuckComponent,
    ShopPromoBanner: shopPromoBannerPuckComponent,
  },
  product: {
    ShopProductDetail: { ...shopProductDetailPuckComponent, ...ANCHOR },
    ShopBackInStockForm: shopBackInStockFormPuckComponent,
    ShopRelatedProducts: shopRelatedProductsPuckComponent,
    ShopUpsellProducts: shopUpsellProductsPuckComponent,
  },
  checkout: {
    ShopCheckoutContact: { ...shopCheckoutContactPuckComponent, ...ANCHOR },
    ShopCheckoutShipping: { ...shopCheckoutShippingPuckComponent, ...ANCHOR },
    ShopCheckoutPayment: { ...shopCheckoutPaymentPuckComponent, ...ANCHOR },
    ShopCheckoutReview: { ...shopCheckoutReviewPuckComponent, ...ANCHOR },
    ShopUpsellProducts: shopUpsellProductsPuckComponent,
  },
  confirmation: {
    ShopOrderConfirmation: { ...shopOrderConfirmationPuckComponent, ...ANCHOR },
  },
} as const

export type ShopPageKey = keyof typeof PAGE_COMPONENTS

export function getShopPageEditorConfig(pageKey: ShopPageKey) {
  const components = PAGE_COMPONENTS[pageKey]
  return {
    categories: { blocks: { title: 'Blocks', components: Object.keys(components), defaultExpanded: true } },
    root: { render: ({ children }: { children: ReactNode }) => children },
    components,
  }
}
