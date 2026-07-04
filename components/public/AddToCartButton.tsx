'use client'

import { useState } from 'react'
import { addToCart } from '@/modules/shop/components/public/cart'

// Quantity stepper + primary add button. Styling comes from the scoped
// `spd-*` <style> emitted by ShopProductDetail on the same page.
export function AddToCartButton({ productId, label }: { productId: string; label?: string }) {
  const [quantity, setQuantity] = useState(1)
  const [added, setAdded] = useState(false)

  return (
    <div className="spd-buy-row">
      <div className="spd-stepper" role="group" aria-label="Quantity">
        <button
          type="button"
          aria-label="Decrease quantity"
          onClick={() => setQuantity((q) => Math.max(1, q - 1))}
          disabled={quantity <= 1}
        >
          &minus;
        </button>
        <input
          type="text"
          inputMode="numeric"
          value={quantity}
          aria-label="Quantity"
          onChange={(e) => setQuantity(Math.max(1, Number(e.target.value.replace(/\D/g, '')) || 1))}
        />
        <button type="button" aria-label="Increase quantity" onClick={() => setQuantity((q) => q + 1)}>
          +
        </button>
      </div>
      <button
        type="button"
        className="spd-add"
        onClick={() => {
          addToCart(productId, quantity)
          setAdded(true)
          setTimeout(() => setAdded(false), 2000)
        }}
      >
        {added ? 'Added to basket' : label || 'Add to basket'}
      </button>
    </div>
  )
}
