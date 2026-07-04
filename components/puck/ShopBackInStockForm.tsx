'use client'

import { useState } from 'react'

export type ShopBackInStockFormProps = { productId?: string; buttonLabel?: string; inStock?: boolean }

// Hidden automatically when the product is in stock (addendum A.8) - the
// product detail page only passes inStock=false when it actually needs this.
function BackInStockForm({ productId, buttonLabel }: { productId?: string; buttonLabel?: string }) {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'submitting' | 'submitted' | 'error'>('idle')

  async function submit() {
    if (!productId || !email) return
    setStatus('submitting')
    const res = await fetch('/api/m/shop/public/back-in-stock', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ productId, email }),
    })
    setStatus(res.ok ? 'submitted' : 'error')
  }

  if (status === 'submitted') return <p style={{ color: 'var(--color-text-muted)' }}>We&apos;ll email you when it&apos;s back.</p>

  return (
    <div style={{ display: 'flex', gap: '0.5rem' }}>
      <input type="email" placeholder="Your email" value={email} onChange={(e) => setEmail(e.target.value)} style={{ padding: '0.5rem 0.75rem', borderRadius: 6, border: '1px solid var(--color-border)', flex: 1 }} />
      <button onClick={submit} disabled={status === 'submitting'} style={{ background: 'var(--color-primary)', color: 'var(--color-on-primary)', border: 'none', borderRadius: 8, padding: '0.5rem 1rem', fontWeight: 600, cursor: 'pointer' }}>
        {buttonLabel || 'Notify me'}
      </button>
    </div>
  )
}

export function ShopBackInStockForm(props: ShopBackInStockFormProps) {
  if (props.inStock) return null
  return <BackInStockForm productId={props.productId} buttonLabel={props.buttonLabel} />
}

export const shopBackInStockFormPuckComponent = {
  label: 'Shop: Back in Stock Form',
  fields: {
    productId: { type: 'text' as const, label: 'Product ID (injected on the product page)' },
    buttonLabel: { type: 'text' as const, label: 'Button label' },
  },
  defaultProps: { buttonLabel: 'Notify me' },
  render: ShopBackInStockForm,
}

export const shopBackInStockFormPuckRscComponent = shopBackInStockFormPuckComponent
