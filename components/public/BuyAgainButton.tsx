'use client'

import { useState } from 'react'
import { addToCart } from '@/modules/shop/components/public/cart'

// "Buy it again" for an order line.
//
// A personalised line is deliberately NOT re-added straight to the basket. What
// the order stores is a snapshot for reading (LineMeta.fields plus an opaque
// data bag each resolver owns), not the raw add-to-cart payload that produced
// it, so rebuilding the basket line from it would be guesswork - and guessing
// wrong means somebody is sent a desk in the wrong finish. Those lines link to
// the product instead, where the options get picked properly.

type Props = {
  productId: string | null
  productSlug: string | null
  quantity: number
  personalised: boolean
}

export default function BuyAgainButton({ productId, productSlug, quantity, personalised }: Props) {
  const [added, setAdded] = useState(false)

  // A product that has since been deleted has nowhere to send anybody.
  if (!productId || !productSlug) return null

  if (personalised) {
    return (
      <a className="btn btn-sm" href={`/shop/products/${productSlug}`}>
        Choose options again
      </a>
    )
  }

  return (
    <button
      type="button"
      className="btn btn-sm"
      onClick={() => {
        addToCart(productId, quantity)
        setAdded(true)
      }}
    >
      {added ? 'Added to basket' : 'Buy again'}
    </button>
  )
}
