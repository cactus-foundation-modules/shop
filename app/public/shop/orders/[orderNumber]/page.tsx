import { OrderLookupClient } from '@/modules/shop/components/public/OrderLookupClient'

export const metadata = { title: 'Order status' }

export default async function ShopOrderStatusPage({ params }: { params: Promise<{ orderNumber: string }> }) {
  const { orderNumber } = await params
  return (
    <div style={{ maxWidth: 640, margin: '0 auto', padding: '2rem 1.5rem' }}>
      <h1 style={{ fontSize: '1.5rem' }}>Order status</h1>
      <OrderLookupClient orderNumber={orderNumber} />
    </div>
  )
}
