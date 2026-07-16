import { Render } from '@puckeditor/core/rsc'
import type { Data } from '@puckeditor/core'
import { getModuleLayoutPuckRscConfig } from '@/lib/puck/config.rsc'
import { resolveThemeLayout } from '@/lib/layout/resolveThemeLayout'
import { getShopConfigCached } from '@/modules/shop/lib/config'
import { canPreviewClosedShop } from '@/modules/shop/lib/access'

export async function generateMetadata() {
  const config = await getShopConfigCached()
  return { title: config.shopTitle || 'Shop', description: config.shopMetaDescription || undefined }
}

export default async function ShopIndexPage() {
  const config = await getShopConfigCached()

  const closed = config.shopStatus === 'CLOSED'
  const staffPreview = closed ? await canPreviewClosedShop() : false

  if (closed && !staffPreview) {
    return <div style={{ maxWidth: 720, margin: '0 auto', padding: '4rem 1.5rem', textAlign: 'center' }}><p>{config.shopClosedMessage}</p></div>
  }

  const layout = await resolveThemeLayout('shopIndex', { moduleName: 'shop' })
  if (!layout?.builderData) return null

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '2rem 1.5rem' }}>
      {staffPreview && (
        <p style={{ margin: '0 0 1.5rem', padding: '0.75rem 1rem', border: '1px solid var(--color-border)', borderRadius: 8, background: 'var(--color-bg-subtle)', color: 'var(--color-text)' }}>
          The shop is closed. Only signed-in staff can see this page - everyone else sees your closed message.
        </p>
      )}
      <Render config={getModuleLayoutPuckRscConfig('shopIndex') as any} data={layout.builderData as Data} />
    </div>
  )
}
