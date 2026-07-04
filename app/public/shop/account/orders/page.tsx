import { redirect, notFound } from 'next/navigation'
import { getMemberFromCookie } from '@/lib/members/session'
import { getMembersConfig } from '@/lib/members/config'
import { getMemberAreaPath } from '@/lib/members/paths'
import { listOrdersByMemberId } from '@/modules/shop/lib/db/orders'
import { getShopConfigCached } from '@/modules/shop/lib/config'

export const metadata = { title: 'Your orders' }

export default async function ShopAccountOrdersPage() {
  const membersConfig = await getMembersConfig()
  if (!membersConfig.enabled) notFound()

  const member = await getMemberFromCookie()
  if (!member) redirect(`/${getMemberAreaPath()}/login?redirect=/shop/account/orders`)

  const [orders, config] = await Promise.all([listOrdersByMemberId(member.id), getShopConfigCached()])

  return (
    <div style={{ maxWidth: 640, margin: '0 auto', padding: '2rem 1.5rem' }}>
      <h1 style={{ fontSize: '1.5rem' }}>Your orders</h1>
      {orders.length === 0 && <p style={{ color: 'var(--color-text-muted)' }}>No orders yet.</p>}
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '0.75rem' }}>
        {orders.map((order) => (
          <li key={order.id} style={{ border: '1px solid var(--color-border)', borderRadius: 8, padding: '0.75rem 1rem' }}>
            <a href={`/shop/account/orders/${order.id}`} style={{ textDecoration: 'none', color: 'inherit', display: 'flex', justifyContent: 'space-between' }}>
              <span>{order.orderNumber} - {order.status}</span>
              <span>{config.currencySymbol}{order.total}</span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  )
}
