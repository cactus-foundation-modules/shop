import { Render } from '@puckeditor/core/rsc'
import type { Data } from '@puckeditor/core'
import { puckRscConfig } from '@/lib/puck/config'
import { getPageLayout } from '@/modules/shop/lib/db/page-layouts'

export const metadata = { title: 'Checkout' }

export default async function ShopCheckoutPage() {
  const layout = await getPageLayout('checkout')
  if (!layout) return null

  return (
    <div style={{ maxWidth: 640, margin: '0 auto', padding: '2rem 1.5rem', display: 'grid', gap: '2rem' }}>
      <h1 style={{ fontSize: '1.75rem', margin: 0 }}>Checkout</h1>
      <Render config={puckRscConfig as any} data={layout.builderData as Data} />
    </div>
  )
}
