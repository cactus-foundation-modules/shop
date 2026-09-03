import { getSiteTimezone } from '@/lib/config/timezone.server'
import Link from 'next/link'
import { getMemberFromCookie } from '@/lib/members/session'
import { getMembersConfig } from '@/lib/members/config'
import { listOrderSummariesForMember } from '@/modules/shop/lib/member-orders'
import { getShopConfigCached } from '@/modules/shop/lib/config'
import { getShopGate } from '@/modules/shop/lib/access'
import { formatMoney } from '@/modules/shop/lib/money'
import { ORDER_STATUS_DISPLAY, badgeClass, formatOrderDate } from '@/modules/shop/lib/order-display'

// Contributed to the core `members.account-section` extension point - the card
// the shop puts on the account overview.
//
// It used to be two text links to pages that had no other route in. Orders are
// a proper tab now (see lib/member-account-nav.ts), so this card earns its place
// by answering the question somebody actually opens their account to ask: where
// has my last order got to?
export async function ShopAccountSection() {
  const timezone = await getSiteTimezone()
  const member = await getMemberFromCookie()
  if (!member) return null

  const gate = await getShopGate()
  if (gate.blocked) return null

  // On a one-page account the whole order history is already further down the
  // page (ShopOrdersSection), so a card summarising the top of it is a card
  // pointing at the thing directly underneath it.
  const membersConfig = await getMembersConfig()
  if (membersConfig.accountSinglePage) return null

  const [summaries, config] = await Promise.all([listOrderSummariesForMember(member), getShopConfigCached()])
  const latest = summaries[0]

  return (
    <div className="card" style={{ padding: 'var(--space-4)', display: 'grid', gap: 'var(--space-3)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 'var(--space-2)' }}>
        <h2 className="card-title" style={{ margin: 0 }}>Your orders</h2>
        <Link href="/shop/account/orders" prefetch={false} style={{ color: 'var(--color-primary)', fontSize: 'var(--text-sm)', textDecoration: 'none' }}>
          See all →
        </Link>
      </div>

      {!latest ? (
        <p style={{ margin: 0, color: 'var(--color-text-muted)' }}>
          Nothing ordered yet. <Link href="/shop" style={{ color: 'var(--color-primary)' }}>Have a look round the shop</Link>.
        </p>
      ) : (
        <Link
          href={`/shop/account/orders/${latest.order.id}`}
          prefetch={false}
          style={{ display: 'grid', gap: '0.375rem', textDecoration: 'none', color: 'inherit' }}
        >
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}>
            <strong style={{ color: 'var(--color-text)' }}>{latest.order.orderNumber}</strong>
            <span className={badgeClass(ORDER_STATUS_DISPLAY[latest.order.status].tone)}>
              {ORDER_STATUS_DISPLAY[latest.order.status].label}
            </span>
            {latest.hasOpenRequest && <span className="badge badge-warning">Request open</span>}
          </div>
          <span style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)' }}>
            {formatOrderDate(latest.order.createdAt, timezone)} · {latest.itemCount} {latest.itemCount === 1 ? 'item' : 'items'} ·{' '}
            {formatMoney(latest.order.total, config.currencySymbol)}
          </span>
        </Link>
      )}
    </div>
  )
}
