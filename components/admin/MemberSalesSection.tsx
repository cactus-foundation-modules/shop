import { headers } from 'next/headers'
import { prisma } from '@/lib/db/prisma'
import { getSiteTimezone } from '@/lib/config/timezone.server'
import { formatInSiteTimezone } from '@/lib/config/timezone'
import { getShopConfigCached } from '@/modules/shop/lib/config'
import { formatMoney } from '@/modules/shop/lib/money'
import { ORDER_STATUS_DISPLAY } from '@/modules/shop/lib/order-display'
import { getMemberSales } from '@/modules/shop/lib/member-sales'

// Contributed to core's members.admin-member-detail extension point: the
// "what have they bought" card at the top of a member's admin page. A server
// component - every figure is read and formatted here, nothing ships to the
// browser but markup - laid out as a plain `.card` so it sits in core's page
// without knowing anything about how that page is styled.

const TONE_BADGE = { default: 'badge-gray', primary: 'badge-primary', success: 'badge-green', warning: 'badge-yellow', error: 'badge-red' } as const

const statStyle = { display: 'flex', flexDirection: 'column', gap: 'var(--space-1)', padding: 'var(--space-3) var(--space-4)', borderRadius: 'var(--radius-md)', background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)', minWidth: 0 } as const
const statValue = { fontSize: 'var(--text-xl)', fontWeight: 'var(--font-semibold)', color: 'var(--color-text)', lineHeight: 1.2, fontVariantNumeric: 'tabular-nums' } as const
const statLabel = { fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' } as const
const muted = { fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', margin: 0 } as const

export async function shopMemberSalesSection({ memberId }: { memberId: string }) {
  const member = await prisma.member.findUnique({ where: { id: memberId }, select: { id: true, email: true, emailVerified: true, fullName: true, organisation: true } })
  if (!member) return null

  const [adminPath, config, timezone, sales] = await Promise.all([
    headers().then((h) => h.get('x-cactus-admin-path') ?? ''),
    getShopConfigCached(),
    getSiteTimezone(),
    getMemberSales(member),
  ])
  const { summary, recentOrders, topProducts, consentSource } = sales
  const money = (amount: string) => formatMoney(amount, config.currencySymbol)
  const day = (date: Date) => formatInSiteTimezone(date, timezone, { day: 'numeric', month: 'short', year: 'numeric' })
  // Who they ordered as, from the newest order, where the account itself does
  // not already say so. An unverified member's guest orders never get to copy
  // their name and company onto the account (lib/member-orders.ts only does
  // that for orders it has claimed), so this is often the only place to see it.
  const newest = recentOrders[0]
  const orderedAs = newest
    ? [
        newest.customerName && newest.customerName !== member.fullName ? newest.customerName : null,
        newest.customerOrganisation && newest.customerOrganisation !== member.organisation ? newest.customerOrganisation : null,
      ].filter((v): v is string => !!v)
    : []
  const customerHref = `/${adminPath}/m/shop/customers/${encodeURIComponent(member.email)}`

  return (
    <section className="card" aria-labelledby="shop-member-sales-title">
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 'var(--space-3)', marginBottom: 'var(--space-4)', flexWrap: 'wrap' }}>
        <div>
          <h2 id="shop-member-sales-title" className="card-title" style={{ margin: 0 }}>Sales</h2>
          <p style={muted}>
            {summary.firstOrderAt
              ? <>Customer since {day(summary.firstOrderAt)}{summary.lastOrderAt && <> · last ordered {day(summary.lastOrderAt)}</>}</>
              : 'Has not bought anything yet.'}
          </p>
          {orderedAs.length > 0 && (
            <p style={muted}>Ordered as <strong style={{ color: 'var(--color-text)' }}>{orderedAs.join(', ')}</strong></p>
          )}
        </div>
        {recentOrders.length > 0 && (
          <a href={customerHref} className="btn btn-secondary btn-sm">All orders</a>
        )}
      </div>

      {recentOrders.length === 0 ? (
        <p style={{ ...muted, textAlign: 'center', padding: 'var(--space-6) var(--space-4)', border: '1px dashed var(--color-border)', borderRadius: 'var(--radius-md)' }}>
          No orders on this account or at {member.email}.
        </p>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 140px), 1fr))', gap: 'var(--space-3)', marginBottom: 'var(--space-4)' }}>
            <div style={statStyle}>
              <span style={statValue}>{money(summary.netSpend)}</span>
              <span style={statLabel}>Lifetime spend</span>
            </div>
            <div style={statStyle}>
              <span style={statValue}>{summary.paidOrders}</span>
              <span style={statLabel}>{summary.paidOrders === 1 ? 'Paid order' : 'Paid orders'}</span>
            </div>
            <div style={statStyle}>
              <span style={statValue}>{money(summary.averageOrderValue)}</span>
              <span style={statLabel}>Average order</span>
            </div>
            <div style={statStyle}>
              <span style={{ ...statValue, color: summary.owedOrders > 0 ? 'var(--color-warning)' : 'var(--color-text)' }}>{money(summary.owedTotal)}</span>
              <span style={statLabel}>{summary.owedOrders > 0 ? `Awaiting payment (${summary.owedOrders})` : 'Nothing owed'}</span>
            </div>
          </div>

          {(Number(summary.refunded) > 0 || summary.guestOrders > 0) && (
            <ul style={{ ...muted, listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: 'var(--space-1)', marginBottom: 'var(--space-4)' }}>
              {Number(summary.refunded) > 0 && <li>{money(summary.refunded)} refunded, already taken off the lifetime spend.</li>}
              {summary.guestOrders > 0 && (
                <li>
                  Includes {summary.guestOrders} {summary.guestOrders === 1 ? 'order' : 'orders'} placed as a guest at {member.email}
                  {member.emailVerified
                    ? ', which move onto the account next time they look at their orders.'
                    : '. The address is not verified, so the shop has not moved them onto the account.'}
                </li>
              )}
            </ul>
          )}

          <h3 style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--font-semibold)', color: 'var(--color-text-secondary)', margin: '0 0 var(--space-2)' }}>Recent orders</h3>
          <div className="table-wrapper" style={{ marginBottom: topProducts.length > 0 ? 'var(--space-4)' : 0 }}>
            <table>
              <thead>
                <tr>
                  <th scope="col">Order</th>
                  <th scope="col">Placed</th>
                  <th scope="col">Status</th>
                  <th scope="col" style={{ textAlign: 'right' }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {recentOrders.map((o) => {
                  const display = ORDER_STATUS_DISPLAY[o.status]
                  return (
                    <tr key={o.id}>
                      <td>
                        <a href={`/${adminPath}/m/shop/orders/${o.id}`} style={{ fontWeight: 'var(--font-medium)' }}>{o.orderNumber}</a>
                        {o.kind === 'REPLACEMENT' && <span className="badge badge-gray" style={{ marginLeft: 'var(--space-2)' }}>Replacement</span>}
                        {o.isGuest && <span className="badge badge-gray" style={{ marginLeft: 'var(--space-2)' }} title="Placed without signing in, at the same email address">Guest</span>}
                      </td>
                      <td style={{ whiteSpace: 'nowrap' }}>{day(o.createdAt)}</td>
                      <td><span className={`badge ${TONE_BADGE[display?.tone ?? 'default']}`}>{display?.label ?? o.status}</span></td>
                      <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{money(o.total)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {topProducts.length > 0 && (
            <>
              <h3 style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--font-semibold)', color: 'var(--color-text-secondary)', margin: '0 0 var(--space-2)' }}>Most bought</h3>
              <ol style={{ margin: 0, paddingLeft: 'var(--space-5)', display: 'flex', flexDirection: 'column', gap: 'var(--space-1)', fontSize: 'var(--text-sm)' }}>
                {topProducts.map((p) => (
                  <li key={p.productName}>
                    {p.productName} <span style={{ color: 'var(--color-text-muted)' }}>· {p.quantity} {p.quantity === 1 ? 'unit' : 'units'} · {money(p.total)}</span>
                  </li>
                ))}
              </ol>
            </>
          )}
        </>
      )}

      {consentSource && (
        <p style={{ ...muted, marginTop: 'var(--space-4)', paddingTop: 'var(--space-3)', borderTop: '1px solid var(--color-border)' }}>
          Marketing answer: <strong style={{ color: 'var(--color-text)' }}>{consentSource.consent ? 'yes' : 'no'}</strong>, given at checkout on{' '}
          <a href={`/${adminPath}/m/shop/orders/${consentSource.orderId}`}>{consentSource.orderNumber}</a> ({day(consentSource.createdAt)}).
          {/* An unclaimed guest order's answer has not reached the account: the
              shop only carries it across with the orders, once the address is
              verified. Said here so the two cards do not appear to disagree. */}
          {consentSource.isGuest && !member.emailVerified && ' That was a guest order, so it will not count on the account until the email address is verified.'}
        </p>
      )}
    </section>
  )
}
