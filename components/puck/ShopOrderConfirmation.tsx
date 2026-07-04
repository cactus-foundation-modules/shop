'use client'

import { useEffect, useState } from 'react'

export type ShopOrderConfirmationProps = Record<string, never>

type OrderStatusResponse = {
  order: { orderNumber: string; total: string; paymentMethod: string; paymentStatus: string }
  items: Array<{ productName: string; quantity: number; total: string }>
}

function ConfirmationView() {
  const [data, setData] = useState<OrderStatusResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const orderNumber = params.get('orderNumber')
    const email = params.get('email')
    if (!orderNumber || !email) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- guard clause on URL params read at mount, no async boundary applies
      setError('Missing order details')
      return
    }

    fetch(`/api/m/shop/public/orders/status?orderNumber=${encodeURIComponent(orderNumber)}&email=${encodeURIComponent(email)}`)
      .then(async (res) => {
        const body = await res.json()
        if (res.ok) setData(body)
        else setError(body.error ?? 'Order not found')
      })
  }, [])

  if (error) return <p style={{ color: 'var(--color-danger, #c00)' }}>{error}</p>
  if (!data) return null

  const isManual = data.order.paymentMethod === 'BANK_TRANSFER' || data.order.paymentMethod === 'CASH'

  return (
    <section style={{ display: 'grid', gap: '1rem', maxWidth: 480 }}>
      <h1 style={{ fontSize: '1.5rem', margin: 0 }}>Thanks for your order</h1>
      <p style={{ color: 'var(--color-text-muted)' }}>Order <strong>{data.order.orderNumber}</strong></p>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '0.375rem' }}>
        {data.items.map((item, i) => (
          <li key={i} style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>{item.productName} x{item.quantity}</span>
            <span>{item.total}</span>
          </li>
        ))}
      </ul>
      {isManual && data.order.paymentStatus === 'AWAITING_CONFIRMATION' && (
        <p style={{ background: 'var(--color-surface-muted)', borderRadius: 6, padding: '0.75rem' }}>
          Your order is awaiting payment confirmation. We&apos;ll be in touch once it clears.
        </p>
      )}
    </section>
  )
}

export function ShopOrderConfirmation() {
  return <ConfirmationView />
}

export const shopOrderConfirmationPuckComponent = {
  label: 'Shop: Order Confirmation',
  fields: {},
  defaultProps: {},
  render: ShopOrderConfirmation,
}

export const shopOrderConfirmationPuckRscComponent = shopOrderConfirmationPuckComponent
