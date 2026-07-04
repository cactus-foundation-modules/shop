import { Render } from '@puckeditor/core/rsc'
import type { Data } from '@puckeditor/core'
import { getModuleLayoutPuckRscConfig } from '@/lib/puck/config'
import { resolveThemeLayout } from '@/lib/layout/resolveThemeLayout'

export const metadata = { title: 'Order confirmed' }

export default async function ShopCheckoutConfirmationPage() {
  const layout = await resolveThemeLayout('shopConfirmation', { moduleName: 'shop' })
  if (!layout?.builderData) return null

  return (
    <div style={{ maxWidth: 640, margin: '0 auto', padding: '2rem 1.5rem' }}>
      <Render config={getModuleLayoutPuckRscConfig('shopConfirmation') as any} data={layout.builderData as Data} />
    </div>
  )
}
