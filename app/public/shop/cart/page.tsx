import { Render } from '@puckeditor/core/rsc'
import type { Data } from '@puckeditor/core'
import { getModuleLayoutPuckRscConfig } from '@/lib/puck/config.rsc'
import { resolveThemeLayout } from '@/lib/layout/resolveThemeLayout'
import { CartPageClient } from '@/modules/shop/components/public/CartPageClient'
import { ShopUpsellProducts } from '@/modules/shop/components/puck/ShopUpsellProducts'

export const metadata = { title: 'Your cart' }

// The cart page is designable via the shopCart layout type (Appearance >
// Layouts > Shop > Cart). A published starter renders the Puck layout (the Cart
// block + upsells by default); if nothing is published we fall back to the
// original hardcoded cart so the page can never go blank - mirrors the
// category/collection fallback pattern.
export default async function ShopCartPage() {
  const layout = await resolveThemeLayout('shopCart', { moduleName: 'shop' })

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '2rem 1.5rem', display: 'grid', gap: '2rem' }}>
      <h1 style={{ fontSize: '1.75rem', margin: 0 }}>Your cart</h1>
      {layout?.builderData ? (
        <Render config={getModuleLayoutPuckRscConfig('shopCart') as any} data={layout.builderData as Data} />
      ) : (
        <>
          <CartPageClient />
          <ShopUpsellProducts />
        </>
      )}
    </div>
  )
}
