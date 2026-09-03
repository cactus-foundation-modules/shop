import { getSiteTimezone } from '@/lib/config/timezone.server'
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
import { OrderSummaryCard } from '@/modules/shop/components/public/OrderSummaryCard'
import { customerReferenceLabel } from '@/modules/shop/lib/customer-reference'

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
  const timezone = await getSiteTimezone()
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
        {visible.map((summary) => (
          <OrderSummaryCard
            key={summary.order.id}
            summary={summary}
            currencySymbol={config.currencySymbol}
            timezone={timezone}
            referenceLabel={config.customerReferenceFieldEnabled ? customerReferenceLabel(config) : undefined}
          />
        ))}
      </div>
    </MemberAccountShell>
  )
}
