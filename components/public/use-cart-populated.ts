'use client'

import { useEffect, useState } from 'react'
import { getCart, subscribeCart } from '@/modules/shop/components/public/cart'

// Whether the basket holds anything at all - the gate every checkout step block
// checks before rendering its form. An empty basket means checkout has nothing
// to sell: the order-summary block says so (with a way back to the shop), and
// the contact/shipping/payment/review steps stand down rather than presenting a
// full set of forms over an order that does not exist.
//
// Returns null until the first client render has read localStorage - the cart
// only exists in the browser, so the server (and the hydration pass) cannot
// know. Callers treat null as "not yet" and render nothing, exactly as the
// order-summary block already does while validating.
//
// `preview` (the layout editor) always reads as populated: the editor has no
// real basket, and a checkout layout whose every block hides itself cannot be
// edited.
export function useCartPopulated(preview = false): boolean | null {
  const [populated, setPopulated] = useState<boolean | null>(null)

  useEffect(() => {
    if (preview) return
    const update = () => setPopulated(getCart().length > 0)
    update()
    return subscribeCart(update)
  }, [preview])

  return preview ? true : populated
}
