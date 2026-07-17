import { Render } from '@puckeditor/core/rsc'
import type { Data } from '@puckeditor/core'
import { getModuleLayoutPuckRscConfig } from '@/lib/puck/config.rsc'
import { resolveThemeLayout } from '@/lib/layout/resolveThemeLayout'
import { getShopGate } from '@/modules/shop/lib/access'
import { ShopClosedNotice, ShopStaffPreviewBanner } from '@/modules/shop/components/public/ShopClosedNotice'

export const metadata = { title: 'Order confirmed' }

export default async function ShopCheckoutConfirmationPage() {
  const gate = await getShopGate()
  if (gate.blocked) return <ShopClosedNotice message={gate.message} />

  const layout = await resolveThemeLayout('shopConfirmation', { moduleName: 'shop' })
  if (!layout?.builderData) return null

  return (
    <div style={{ maxWidth: 640, margin: '0 auto', padding: '2rem 1.5rem' }}>
      {gate.staffPreview && <ShopStaffPreviewBanner />}
      <Render config={getModuleLayoutPuckRscConfig('shopConfirmation') as any} data={layout.builderData as Data} />
    </div>
  )
}
