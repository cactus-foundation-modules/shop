'use client'

import { useState } from 'react'
import { addToCart } from '@/modules/shop/components/public/cart'
import { productHref, type ProductUrlStyle } from '@/modules/shop/lib/product-url'

// "Buy it again" for an order line.
//
// One label either way, because the shopper's intent is the same one both times
// and "Choose options again" only ever read as a different, lesser offer. What
// changes is what the button does underneath.
//
// A personalised line is deliberately NOT re-added straight to the basket. What
// the order stores is a snapshot for reading (LineMeta.fields plus an opaque
// data bag each resolver owns), not the raw add-to-cart payload that produced
// it, so rebuilding the basket line from it would be guesswork - and guessing
// wrong means somebody is sent a desk in the wrong finish. Those lines link to
// the product instead. The link is no cold start: the slug on the line is the
// one that was bought, and a variant child's slug resolves to its parent's page
// opened on that exact combination (shop.product-page-resolver), so the shopper
// lands on their own variation with only the add-to-basket left to do.

type Props = {
  productId: string | null
  productSlug: string | null
  quantity: number
  personalised: boolean
  // Handed down by the order page rather than fetched: that page is a server
  // component with the shop config already open, and a link that guessed the
  // style would 404 on every shop serving its products from the root.
  productUrlStyle: ProductUrlStyle
}

export default function BuyAgainButton({ productId, productSlug, quantity, personalised, productUrlStyle }: Props) {
  const [added, setAdded] = useState(false)

  // A product that has since been deleted has nowhere to send anybody.
  if (!productId || !productSlug) return null

  if (personalised) {
    return (
      <a className="btn btn-sm" href={productHref(productSlug, productUrlStyle)}>
        Buy again
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
