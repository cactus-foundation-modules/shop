import { getSiteTimezone } from '@/lib/config/timezone.server'
import Link from 'next/link'
import { getMemberFromCookie } from '@/lib/members/session'
import { listOrderSummariesForMember } from '@/modules/shop/lib/member-orders'
import { getShopConfigCached } from '@/modules/shop/lib/config'
import { getShopGate } from '@/modules/shop/lib/access'
import { OrderSummaryCard } from '@/modules/shop/components/public/OrderSummaryCard'
import { customerReferenceLabel } from '@/modules/shop/lib/customer-reference'
import { OrdersFilterList, type OrdersBucket } from '@/modules/shop/components/public/OrdersFilterList'

// The order history, drawn into the account rather than sitting behind a tab of
// its own. Core asks for this (through the `sectionId` on shop's Orders tab)
// only where the site has the one-page account switched on; everywhere else the
// page at /shop/account/orders is still the whole of it.
//
// Same data, same cards, same filters as that page - it would be a poor sort of
// "whole account on one page" if the orders on it were a cut-down version.

function bucketOf(status: string): OrdersBucket {
  if (status === 'COMPLETED') return 'complete'
  if (status === 'CANCELLED' || status === 'REFUNDED') return 'cancelled'
  return 'open'
}

export async function ShopOrdersSection() {
  const timezone = await getSiteTimezone()
  const member = await getMemberFromCookie()
  if (!member) return null

  const gate = await getShopGate()
  if (gate.blocked) return null

  const [summaries, config] = await Promise.all([listOrderSummariesForMember(member), getShopConfigCached()])

  return (
    <div>
      <h2 style={{ fontSize: 'var(--text-xl)', fontWeight: 'var(--font-semibold)', margin: '0 0 var(--space-4)', color: 'var(--color-text)' }}>
        Your orders
      </h2>

      {summaries.length === 0 ? (
        <div className="card" style={{ padding: 'var(--space-6)', textAlign: 'center' }}>
          <p style={{ margin: '0 0 var(--space-3)', color: 'var(--color-text-muted)' }}>
            No orders yet. Nothing to see here, which is at least tidy.
          </p>
          <Link href="/shop" className="btn btn-primary">Have a look round the shop</Link>
        </div>
      ) : (
        <OrdersFilterList
          items={summaries.map((summary) => ({
            id: summary.order.id,
            bucket: bucketOf(summary.order.status),
            card: (
              <OrderSummaryCard
                summary={summary}
                currencySymbol={config.currencySymbol}
                timezone={timezone}
                referenceLabel={config.customerReferenceFieldEnabled ? customerReferenceLabel(config) : undefined}
              />
            ),
          }))}
        />
      )}
    </div>
  )
}
