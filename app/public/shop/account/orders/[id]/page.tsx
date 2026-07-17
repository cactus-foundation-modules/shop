import { redirect, notFound } from 'next/navigation'
import { getMemberFromCookie } from '@/lib/members/session'
import { getMembersConfig } from '@/lib/members/config'
import { getMemberAreaPath } from '@/lib/members/paths'
import { getOrderById, getOrderItems } from '@/modules/shop/lib/db/orders'
import { listDownloadsForOrder } from '@/modules/shop/lib/db/digital'
import { getShopConfigCached } from '@/modules/shop/lib/config'
import { getShopGate } from '@/modules/shop/lib/access'
import { ShopClosedNotice, ShopStaffPreviewBanner } from '@/modules/shop/components/public/ShopClosedNotice'
import { formatMoney } from '@/modules/shop/lib/money'

export const metadata = { title: 'Order detail' }

export default async function ShopAccountOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const membersConfig = await getMembersConfig()
  if (!membersConfig.enabled) notFound()

  const gate = await getShopGate()
  if (gate.blocked) return <ShopClosedNotice message={gate.message} />

  const member = await getMemberFromCookie()
  if (!member) redirect(`/${getMemberAreaPath()}/login?redirect=/shop/account/orders`)

  const { id } = await params
  const order = await getOrderById(id)
  if (!order || order.memberId !== member.id) notFound()

  const [items, downloads, config] = await Promise.all([getOrderItems(id), listDownloadsForOrder(id), getShopConfigCached()])

  return (
    <div style={{ maxWidth: 640, margin: '0 auto', padding: '2rem 1.5rem' }}>
      {gate.staffPreview && <ShopStaffPreviewBanner />}
      <h1 style={{ fontSize: '1.5rem' }}>Order {order.orderNumber}</h1>
      <p>Status: {order.status}</p>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '0.5rem' }}>
        {items.map((item) => (
          <li key={item.id} style={{ display: 'grid', gap: '0.125rem' }}>
            <span style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>{item.productName} x{item.quantity}</span>
              <span>{formatMoney(item.total, config.currencySymbol)}</span>
            </span>
            {item.lineMeta?.fields?.length ? (
              <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '0.125rem' }}>
                {item.lineMeta.fields.map((f, i) => (
                  <li key={i} style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)' }}>
                    <span style={{ fontWeight: 500 }}>{f.label}:</span>{' '}
                    {f.href ? <a href={f.href} target="_blank" rel="noopener noreferrer">{f.value}</a> : f.value}
                  </li>
                ))}
              </ul>
            ) : null}
          </li>
        ))}
      </ul>
      <p style={{ fontWeight: 600 }}>Total: {formatMoney(order.total, config.currencySymbol)}</p>
      {downloads.length > 0 && (
        <div>
          <h2 style={{ fontSize: '1.125rem' }}>Downloads</h2>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {downloads.map((d) => (
              <li key={d.id}><a href={`/shop/downloads/${d.token}`}>Download</a></li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
