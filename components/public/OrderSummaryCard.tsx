import Link from 'next/link'
import { formatMoney } from '@/modules/shop/lib/money'
import { ORDER_STATUS_DISPLAY, FULFILMENT_DISPLAY, badgeClass, formatOrderDate } from '@/modules/shop/lib/order-display'
import type { MemberOrderSummary } from '@/modules/shop/lib/member-orders'

// One order in a member's order history. Shared by the Orders page and by the
// Orders section on a one-page account, so the two cannot end up showing the
// same order two different ways.
export function OrderSummaryCard({
  summary,
  currencySymbol,
}: {
  summary: MemberOrderSummary
  currencySymbol: string
}) {
  const { order, lines, itemCount, fulfilment, hasOpenRequest } = summary
  const status = ORDER_STATUS_DISPLAY[order.status]
  const dispatch = FULFILMENT_DISPLAY[fulfilment]
  // Dispatch progress is worth saying only while it is still in play:
  // "All dispatched" on a completed order is noise, and on a cancelled
  // one it is nonsense.
  const showDispatch = !['CANCELLED', 'REFUNDED', 'COMPLETED', 'PENDING'].includes(order.status)

  return (
    <Link
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
            {formatMoney(order.total, currencySymbol)}
          </div>
          <div style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)' }}>
            {itemCount} {itemCount === 1 ? 'item' : 'items'}
          </div>
        </div>
      </div>
    </Link>
  )
}
