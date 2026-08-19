'use client'

import { useState } from 'react'
import { addToCart } from '@/modules/shop/components/public/cart'
import { minOrderSentence } from '@/modules/shop/lib/min-order'

// Quantity stepper + primary add button. Styling comes from the scoped
// `spd-*` <style> emitted by the Add to Cart part on the same page. The stepper
// can be hidden per-part (plain button only) via `showStepper`.
//
// `minQuantity` is the fewest the shop will sell in one go - 1 for all but a
// handful of products. It is the stepper's floor AND its opening figure: a box
// of fifty that starts at one and refuses to be bought is a worse experience
// than one that simply starts at fifty and says why.
export function AddToCartButton({ productId, label, showStepper = true, minQuantity = 1 }: { productId: string; label?: string; showStepper?: boolean; minQuantity?: number }) {
  const min = Number.isFinite(minQuantity) && minQuantity > 1 ? Math.floor(minQuantity) : 1
  const [quantity, setQuantity] = useState(min)
  const [added, setAdded] = useState(false)

  return (
    <>
      <div className="spd-buy-row">
        {showStepper && (
          <div className="spd-stepper" role="group" aria-label="Quantity">
            <button
              type="button"
              aria-label="Decrease quantity"
              onClick={() => setQuantity((q) => Math.max(min, q - 1))}
              disabled={quantity <= min}
            >
              &minus;
            </button>
            <input
              type="text"
              inputMode="numeric"
              value={quantity}
              aria-label="Quantity"
              onChange={(e) => setQuantity(Math.max(min, Number(e.target.value.replace(/\D/g, '')) || min))}
            />
            <button type="button" aria-label="Increase quantity" onClick={() => setQuantity((q) => q + 1)}>
              +
            </button>
          </div>
        )}
        <button
          type="button"
          className="spd-add"
          onClick={() => {
            addToCart(productId, Math.max(min, quantity))
            setAdded(true)
            setTimeout(() => setAdded(false), 2000)
          }}
        >
          {added ? 'Added to basket' : label || 'Add to basket'}
        </button>
      </div>
      {/* Said once, under the row, whether or not the stepper is showing - a
          button-only part still sells fifty at a time and the shopper is owed
          that before the basket tells them. */}
      {min > 1 && <p className="spd-minqty">{minOrderSentence(min)}</p>}
    </>
  )
}
