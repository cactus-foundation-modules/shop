import Link from 'next/link'
import { redirect, notFound } from 'next/navigation'
import { getMemberFromCookie } from '@/lib/members/session'
import { getMembersConfig } from '@/lib/members/config'
import { getMemberAreaPath } from '@/lib/members/paths'
import { getMemberOrderDetail } from '@/modules/shop/lib/member-orders'
import { getShopConfigCached } from '@/modules/shop/lib/config'
import { getShopGate } from '@/modules/shop/lib/access'
import { ShopClosedNotice } from '@/modules/shop/components/public/ShopClosedNotice'
import { formatMoney } from '@/modules/shop/lib/money'
import { addressLines, formatOrderDate } from '@/modules/shop/lib/order-display'
import PrintButton from '@/modules/shop/components/public/PrintButton'

export const metadata = { title: 'Receipt' }
export const dynamic = 'force-dynamic'

// A receipt, deliberately not called a VAT invoice: the shop settings hold no
// registration number or trading address, so calling it one would be a claim
// the data cannot back up. It prints on one page with no site chrome.
const PRINT_CSS = `
@media print {
  .no-print { display: none !important; }
  body { background: #fff; }
  .receipt { border: none !important; padding: 0 !important; }
}
`

export default async function ShopAccountOrderReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const membersConfig = await getMembersConfig()
  if (!membersConfig.enabled) notFound()

  const gate = await getShopGate()
  if (gate.blocked) return <ShopClosedNotice message={gate.message} />

  const member = await getMemberFromCookie()
  if (!member) redirect(`/${getMemberAreaPath()}/login?redirect=/shop/account/orders`)

  const { id } = await params
  const [detail, config] = await Promise.all([getMemberOrderDetail(id, member), getShopConfigCached()])
  if (!detail) notFound()

  const { order, lines, refunds } = detail
  const symbol = config.currencySymbol
  const refundedTotal = refunds
    .filter((refund) => refund.status === 'COMPLETED')
    .reduce((sum, refund) => sum + Number(refund.amount), 0)

  return (
    <div style={{ maxWidth: 720, margin: '3rem auto', padding: '0 1.5rem' }}>
      <style>{PRINT_CSS}</style>

      <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)' }}>
        <Link href={`/shop/account/orders/${order.id}`} prefetch={false} style={{ color: 'var(--color-text-muted)', textDecoration: 'none' }}>
          ← Back to the order
        </Link>
        <PrintButton label="Print receipt" />
      </div>

      <div className="receipt" style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-6)', display: 'grid', gap: 'var(--space-5)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 'var(--space-3)' }}>
          <div>
            <h1 style={{ fontSize: 'var(--text-xl)', margin: 0, color: 'var(--color-text)' }}>Receipt</h1>
            <p style={{ margin: '0.25rem 0 0', color: 'var(--color-text-muted)' }}>
              {config.shopTitle || 'Shop'}
              {config.storeEmail ? ` · ${config.storeEmail}` : ''}
            </p>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontWeight: 'var(--font-semibold)' }}>{order.orderNumber}</div>
            <div style={{ color: 'var(--color-text-muted)' }}>{formatOrderDate(order.createdAt)}</div>
          </div>
        </div>

        <div style={{ display: 'grid', gap: 'var(--space-4)', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
          <div>
            <strong>Delivered to</strong>
            <address style={{ fontStyle: 'normal', color: 'var(--color-text-muted)', display: 'grid', gap: '0.125rem', marginTop: '0.25rem' }}>
              {addressLines(order.shippingAddress).map((line, i) => <span key={i}>{line}</span>)}
            </address>
          </div>
          {order.billingAddress && (
            <div>
              <strong>Billed to</strong>
              <address style={{ fontStyle: 'normal', color: 'var(--color-text-muted)', display: 'grid', gap: '0.125rem', marginTop: '0.25rem' }}>
                {addressLines(order.billingAddress).map((line, i) => <span key={i}>{line}</span>)}
              </address>
            </div>
          )}
        </div>

        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
              <th style={{ textAlign: 'left', padding: '0.5rem 0' }}>Item</th>
              <th style={{ textAlign: 'right', padding: '0.5rem 0' }}>Qty</th>
              <th style={{ textAlign: 'right', padding: '0.5rem 0' }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => (
              <tr key={line.item.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                <td style={{ padding: '0.5rem 0' }}>
                  {line.item.productName}
                  {line.item.productSku && (
                    <div style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)' }}>{line.item.productSku}</div>
                  )}
                  {line.item.lineMeta?.fields?.length ? (
                    <div style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)' }}>
                      {line.item.lineMeta.fields.map((field) => `${field.label}: ${field.value}`).join(' · ')}
                    </div>
                  ) : null}
                </td>
                <td style={{ textAlign: 'right', padding: '0.5rem 0' }}>{line.item.quantity}</td>
                <td style={{ textAlign: 'right', padding: '0.5rem 0' }}>{formatMoney(line.item.total, symbol)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ display: 'grid', gap: '0.25rem', justifyItems: 'end' }}>
          <div style={{ display: 'grid', gap: '0.25rem', minWidth: 240 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Items</span><span>{formatMoney(order.subtotal, symbol)}</span>
            </div>
            {Number(order.discountAmount) > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>{order.couponCode ? `Discount (${order.couponCode})` : 'Discount'}</span>
                <span>-{formatMoney(order.discountAmount, symbol)}</span>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>{order.shippingRateName || 'Delivery'}</span><span>{formatMoney(order.shippingAmount, symbol)}</span>
            </div>
            {Number(order.taxAmount) > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>{order.taxMode === 'INCLUSIVE' ? 'VAT (included)' : 'VAT'}</span>
                <span>{formatMoney(order.taxAmount, symbol)}</span>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'var(--font-semibold)', borderTop: '1px solid var(--color-border)', paddingTop: '0.25rem' }}>
              <span>Total</span><span>{formatMoney(order.total, symbol)}</span>
            </div>
            {refundedTotal > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Refunded</span><span>-{formatMoney(refundedTotal, symbol)}</span>
              </div>
            )}
          </div>
        </div>

        <p style={{ margin: 0, color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)' }}>
          {order.paidAt ? `Paid ${formatOrderDate(order.paidAt)}.` : 'Payment outstanding.'} Thanks for your order.
        </p>
      </div>
    </div>
  )
}
