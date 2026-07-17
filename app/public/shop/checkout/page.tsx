import { Render } from '@puckeditor/core/rsc'
import type { Data } from '@puckeditor/core'
import { getModuleLayoutPuckRscConfig } from '@/lib/puck/config.rsc'
import { resolveThemeLayout } from '@/lib/layout/resolveThemeLayout'
import { getShopGate } from '@/modules/shop/lib/access'
import { ShopClosedNotice, ShopStaffPreviewBanner } from '@/modules/shop/components/public/ShopClosedNotice'

export const metadata = { title: 'Checkout' }

export default async function ShopCheckoutPage() {
  const gate = await getShopGate()
  if (gate.blocked) return <ShopClosedNotice message={gate.message} />

  const layout = await resolveThemeLayout('shopCheckout', { moduleName: 'shop' })
  if (!layout?.builderData) return null

  return (
    <div style={{ maxWidth: 640, margin: '0 auto', padding: '2rem 1.5rem', display: 'grid', gap: '2rem' }}>
      {gate.staffPreview && <ShopStaffPreviewBanner />}
      <h1 style={{ fontSize: '1.75rem', margin: 0 }}>Checkout</h1>
      <Render config={getModuleLayoutPuckRscConfig('shopCheckout') as any} data={layout.builderData as Data} />
    </div>
  )
}
