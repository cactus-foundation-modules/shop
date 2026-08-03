import Link from 'next/link'
import { redirect, notFound } from 'next/navigation'
import { getMemberFromCookie } from '@/lib/members/session'
import { getMembersConfig } from '@/lib/members/config'
import { getMemberAreaPath } from '@/lib/members/paths'
import MemberAccountShell from '@/components/members/account/MemberAccountShell'
import { listOrderSummariesForMember, type MemberOrderSummary } from '@/modules/shop/lib/member-orders'
import { getShopConfigCached } from '@/modules/shop/lib/config'
import { getShopGate } from '@/modules/shop/lib/access'
import { ShopClosedNotice, ShopStaffPreviewBanner } from '@/modules/shop/components/public/ShopClosedNotice'
import { formatMoney } from '@/modules/shop/lib/money'
import { ORDER_STATUS_DISPLAY, FULFILMENT_DISPLAY, badgeClass, formatOrderDate } from '@/modules/shop/lib/order-display'

export const metadata = { title: 'Your orders' }
export const dynamic = 'force-dynamic'

// Filters as links rather than a client component: there is no state here the
// URL cannot hold, and an order history that works with JavaScript off is one
// fewer thing to go wrong on somebody's locked-down work laptop.
const FILTERS = [
  { key: 'all', label: 'All orders' },
  { key: 'open', label: 'In progress' },
  { key: 'complete', label: 'Completed' },
  { key: 'cancelled', label: 'Cancelled' },
] as const

type FilterKey = (typeof FILTERS)[number]['key']

function matchesFilter(summary: MemberOrderSummary, filter: FilterKey): boolean {
  const status = summary.order.status
  if (filter === 'complete') return status === 'COMPLETED'
  if (filter === 'cancelled') return status === 'CANCELLED' || status === 'REFUNDED'
  if (filter === 'open') return !['COMPLETED', 'CANCELLED', 'REFUNDED'].includes(status)
  return true
}

type Props = { searchParams: Promise<{ show?: string }> }

export default async function ShopAccountOrdersPage({ searchParams }: Props) {
  const membersConfig = await getMembersConfig()
  if (!membersConfig.enabled) notFound()

  const gate = await getShopGate()
  if (gate.blocked) return <ShopClosedNotice message={gate.message} />

  const member = await getMemberFromCookie()
  if (!member) redirect(`/${getMemberAreaPath()}/login?redirect=/shop/account/orders`)

  // listOrderSummariesForMember, not a plain list-by-id: a shopper who took up
  // the post-purchase "create an account" prompt placed that order as a guest,
  // and this is where it gets handed to the account they made for it.
  const [summaries, config] = await Promise.all([listOrderSummariesForMember(member), getShopConfigCached()])

  const { show } = await searchParams
  const filter: FilterKey = FILTERS.some((f) => f.key === show) ? (show as FilterKey) : 'all'
  const visible = summaries.filter((summary) => matchesFilter(summary, filter))

  return (
    <MemberAccountShell member={member} maxWidth={880}>
      {gate.staffPreview && <ShopStaffPreviewBanner />}

      <h1 style={{ fontSize: 'var(--text-2xl)', fontWeight: 'var(--font-semibold)', margin: '0 0 var(--space-4)', color: 'var(--color-text)' }}>
        Your orders
      </h1>

      {summaries.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: 'var(--space-4)' }}>
          {FILTERS.map((option) => {
            const count = summaries.filter((summary) => matchesFilter(summary, option.key)).length
            const active = option.key === filter
            return (
              <Link
                key={option.key}
                href={option.key === 'all' ? '/shop/account/orders' : `/shop/account/orders?show=${option.key}`}
                prefetch={false}
                style={{
                  padding: '0.375rem 0.75rem',
                  borderRadius: 'var(--radius-full)',
                  border: `1px solid ${active ? 'var(--color-primary)' : 'var(--color-border)'}`,
                  background: active ? 'var(--color-primary-subtle)' : 'transparent',
                  color: active ? 'var(--color-primary-dark)' : 'var(--color-text-muted)',
                  textDecoration: 'none',
                  fontSize: 'var(--text-sm)',
                  fontWeight: active ? 'var(--font-semibold)' : 'var(--font-normal)',
                }}
              >
                {option.label} ({count})
              </Link>
            )
          })}
        </div>
      )}

      {summaries.length === 0 && (
        <div className="card" style={{ padding: 'var(--space-6)', textAlign: 'center' }}>
          <p style={{ margin: '0 0 var(--space-3)', color: 'var(--color-text-muted)' }}>
            No orders yet. Nothing to see here, which is at least tidy.
          </p>
          <Link href="/shop" className="btn btn-primary">Have a look round the shop</Link>
        </div>
      )}

      {summaries.length > 0 && visible.length === 0 && (
        <p style={{ color: 'var(--color-text-muted)' }}>No orders match that filter.</p>
      )}

      <div style={{ display: 'grid', gap: 'var(--space-3)' }}>
        {visible.map(({ order, lines, itemCount, fulfilment, hasOpenRequest }) => {
          const status = ORDER_STATUS_DISPLAY[order.status]
          const dispatch = FULFILMENT_DISPLAY[fulfilment]
          // Dispatch progress is worth saying only while it is still in play:
          // "All dispatched" on a completed order is noise, and on a cancelled
          // one it is nonsense.
          const showDispatch = !['CANCELLED', 'REFUNDED', 'COMPLETED', 'PENDING'].includes(order.status)
          return (
            <Link
              key={order.id}
              href={`/shop/account/orders/${order.id}`}
              prefetch={false}
              className="card"
              style={{ padding: 'var(--space-4)', display: 'grid', gap: 'var(--space-3)', textDecoration: 'none', color: 'inherit' }}
            >
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}>
                  <strong style={{ color: 'var(--color-text)' }}>{order.orderNumber}</strong>
                  <span className={badgeClass(status.tone)}>{status.label}</span>
                  {showDispatch && <span className={badgeClass(dispatch.tone)}>{dispatch.label}</span>}
                  {hasOpenRequest && <span className="badge badge-warning">Request open</span>}
                </div>
                <span style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)' }}>
                  {formatOrderDate(order.createdAt)}
                </span>
              </div>

              <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center' }}>
                <div style={{ display: 'flex', gap: '0.375rem', flexWrap: 'wrap' }}>
                  {lines.slice(0, 4).map((line) =>
                    line.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element -- storage-served product image, not a local asset next/image can optimise
                      <img
                        key={line.item.id}
                        src={line.imageUrl}
                        alt=""
                        width={56}
                        height={56}
                        style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}
                      />
                    ) : (
                      <div
                        key={line.item.id}
                        aria-hidden
                        style={{ width: 56, height: 56, borderRadius: 'var(--radius-md)', background: 'var(--color-bg-subtle)', border: '1px solid var(--color-border)' }}
                      />
                    ),
                  )}
                  {lines.length > 4 && (
                    <div
                      style={{ width: 56, height: 56, borderRadius: 'var(--radius-md)', background: 'var(--color-bg-subtle)', border: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)' }}
                    >
                      +{lines.length - 4}
                    </div>
                  )}
                </div>
                <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
                  <div style={{ fontWeight: 'var(--font-semibold)', color: 'var(--color-text)' }}>
                    {formatMoney(order.total, config.currencySymbol)}
                  </div>
                  <div style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)' }}>
                    {itemCount} {itemCount === 1 ? 'item' : 'items'}
                  </div>
                </div>
              </div>
            </Link>
          )
        })}
      </div>
    </MemberAccountShell>
  )
}
