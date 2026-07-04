import { Render } from '@puckeditor/core/rsc'
import type { Data } from '@puckeditor/core'
import { getModuleLayoutPuckRscConfig } from '@/lib/puck/config'
import { resolveThemeLayout } from '@/lib/layout/resolveThemeLayout'
import { getShopConfigCached } from '@/modules/shop/lib/config'

export async function generateMetadata() {
  const config = await getShopConfigCached()
  return { title: config.shopTitle || 'Shop', description: config.shopMetaDescription || undefined }
}

export default async function ShopIndexPage() {
  const config = await getShopConfigCached()

  if (config.shopStatus === 'CLOSED') {
    return <div style={{ maxWidth: 720, margin: '0 auto', padding: '4rem 1.5rem', textAlign: 'center' }}><p>{config.shopClosedMessage}</p></div>
  }

  const layout = await resolveThemeLayout('shopIndex', { moduleName: 'shop' })
  if (!layout?.builderData) return null

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '2rem 1.5rem' }}>
      <Render config={getModuleLayoutPuckRscConfig('shopIndex') as any} data={layout.builderData as Data} />
    </div>
  )
}
