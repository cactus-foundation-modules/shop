'use client'

import { useEffect, useState } from 'react'
import type { ProductUrlStyle } from '@/modules/shop/lib/product-url'
import { fetchShopPublicConfig } from '@/modules/shop/lib/public-config-client'

// Sibling of use-currency-symbol, same shape and the same reason: admin screens
// render client-side and don't otherwise load shop config, so a screen linking
// out to a product page has no way of knowing whether that page lives at
// /shop/products/<slug> or at the bare /<slug>. Guessing the prefixed one sends
// the owner to a 404 on every shop that has moved its products to the root.
//
// Cached at module scope so every screen after the first gets it without another
// round-trip. 'SHOP' stands in until the fetch resolves - the same default the
// setting itself carries, so nothing changes on a shop that never moved.
let cached: ProductUrlStyle | null = null

export function useProductUrlStyle(): ProductUrlStyle {
  const [style, setStyle] = useState<ProductUrlStyle>(cached ?? 'SHOP')

  useEffect(() => {
    if (cached !== null) return
    let active = true
    fetchShopPublicConfig()
      .then((data) => {
        const next = data?.productUrlStyle
        if (next !== 'ROOT' && next !== 'SHOP') return
        cached = next
        if (active) setStyle(next)
      })
      .catch(() => {})
    return () => { active = false }
  }, [])

  return style
}
