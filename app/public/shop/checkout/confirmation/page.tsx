import { Render } from '@puckeditor/core/rsc'
import type { Data } from '@puckeditor/core'
import { puckRscConfig } from '@/lib/puck/config'
import { getPageLayout } from '@/modules/shop/lib/db/page-layouts'

export const metadata = { title: 'Order confirmed' }

export default async function ShopCheckoutConfirmationPage() {
  const layout = await getPageLayout('confirmation')
  if (!layout) return null

  return (
    <div style={{ maxWidth: 640, margin: '0 auto', padding: '2rem 1.5rem' }}>
      <Render config={puckRscConfig as any} data={layout.builderData as Data} />
    </div>
  )
}
