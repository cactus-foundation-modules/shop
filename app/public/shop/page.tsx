import { Render } from '@puckeditor/core/rsc'
import type { Data } from '@puckeditor/core'
import { puckRscConfig } from '@/lib/puck/config'
import { getPageLayout } from '@/modules/shop/lib/db/page-layouts'
import { getShopConfigCached } from '@/modules/shop/lib/config'

export async function generateMetadata() {
  const config = await getShopConfigCached()
  return { title: config.shopTitle || 'Shop', description: config.shopMetaDescription || undefined }
}

export default async function ShopIndexPage() {
  const config = await getShopConfigCached()
  const layout = await getPageLayout('index')

  if (config.shopStatus === 'CLOSED') {
    return <div style={{ maxWidth: 720, margin: '0 auto', padding: '4rem 1.5rem', textAlign: 'center' }}><p>{config.shopClosedMessage}</p></div>
  }

  if (!layout) return null

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '2rem 1.5rem' }}>
      <Render config={puckRscConfig as any} data={layout.builderData as Data} />
    </div>
  )
}
