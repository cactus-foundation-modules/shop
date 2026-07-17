import { OrderLookupClient } from '@/modules/shop/components/public/OrderLookupClient'
import { getShopGate } from '@/modules/shop/lib/access'
import { ShopClosedNotice, ShopStaffPreviewBanner } from '@/modules/shop/components/public/ShopClosedNotice'

export const metadata = { title: 'Order status' }

export default async function ShopOrderStatusPage({ params }: { params: Promise<{ orderNumber: string }> }) {
  const { orderNumber } = await params
  const gate = await getShopGate()
  if (gate.blocked) return <ShopClosedNotice message={gate.message} />

  return (
    <div style={{ maxWidth: 640, margin: '0 auto', padding: '2rem 1.5rem' }}>
      {gate.staffPreview && <ShopStaffPreviewBanner />}
      <h1 style={{ fontSize: '1.5rem' }}>Order status</h1>
      <OrderLookupClient orderNumber={orderNumber} />
    </div>
  )
}
