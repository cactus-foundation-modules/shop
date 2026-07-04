'use client'

import { useState } from 'react'
import { addToCart } from '@/modules/shop/components/public/cart'

export function AddToCartButton({ productId }: { productId: string }) {
  const [quantity, setQuantity] = useState(1)
  const [added, setAdded] = useState(false)

  return (
    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
      <input
        type="number" min={1} value={quantity}
        onChange={(e) => setQuantity(Math.max(1, Number(e.target.value)))}
        style={{ width: 64, padding: '0.5rem', borderRadius: 6, border: '1px solid var(--color-border)' }}
      />
      <button
        onClick={() => { addToCart(productId, quantity); setAdded(true); setTimeout(() => setAdded(false), 2000) }}
        style={{ background: 'var(--color-primary)', color: 'var(--color-primary-contrast, #fff)', border: 'none', borderRadius: 8, padding: '0.625rem 1.25rem', fontWeight: 600, cursor: 'pointer' }}
      >
        {added ? 'Added!' : 'Add to cart'}
      </button>
    </div>
  )
}
