'use client'

import { useEffect, useState } from 'react'
import { getCart, subscribeCart } from '@/modules/shop/components/public/cart'

export type ShopUpsellProductsProps = { heading?: string; layout?: string }

type UpsellProduct = { id: string; slug: string; name: string; price: string }

function UpsellStrip({ heading }: { heading?: string }) {
  const [products, setProducts] = useState<UpsellProduct[]>([])
  const [currencySymbol, setCurrencySymbol] = useState('£')

  useEffect(() => {
    let cancelled = false

    async function refresh() {
      const cart = getCart()
      if (cart.length === 0) { setProducts([]); return }

      const configRes = await fetch('/api/m/shop/public/config')
      if (configRes.ok) setCurrencySymbol((await configRes.json()).currencySymbol)

      const detailRes = await fetch('/api/m/shop/public/products?perPage=100')
      const { products: allProducts } = detailRes.ok ? await detailRes.json() : { products: [] }
      const inCartIds = new Set(cart.map((l) => l.productId))
      const cartSlugs = allProducts.filter((p: { id: string }) => inCartIds.has(p.id)).map((p: { slug: string }) => p.slug)

      const seen = new Map<string, UpsellProduct>()
      for (const slug of cartSlugs) {
        const res = await fetch(`/api/m/shop/public/products/${slug}/upsells`)
        if (!res.ok) continue
        const { products: upsells } = await res.json()
        for (const p of upsells) {
          if (!inCartIds.has(p.id) && !seen.has(p.id)) seen.set(p.id, p)
        }
      }
      if (!cancelled) setProducts([...seen.values()].slice(0, 4))
    }

    refresh()
    return subscribeCart(refresh)
  }, [])

  if (products.length === 0) return null

  return (
    <section>
      <h2 style={{ fontSize: '1.125rem' }}>{heading || 'You might also like'}</h2>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${products.length}, 1fr)`, gap: '1rem' }}>
        {products.map((p) => (
          <a key={p.id} href={`/shop/products/${p.slug}`} style={{ textDecoration: 'none', color: 'inherit', border: '1px solid var(--color-border)', borderRadius: 8, padding: '0.75rem' }}>
            <div style={{ fontSize: '0.9375rem' }}>{p.name}</div>
            <div style={{ fontWeight: 600 }}>{currencySymbol}{p.price}</div>
          </a>
        ))}
      </div>
    </section>
  )
}

export function ShopUpsellProducts(props: ShopUpsellProductsProps) {
  return <UpsellStrip heading={props.heading} />
}

export const shopUpsellProductsPuckComponent = {
  label: 'Shop: Upsell Products',
  fields: { heading: { type: 'text' as const, label: 'Heading' }, layout: { type: 'select' as const, label: 'Layout', options: [{ value: 'Grid', label: 'Grid' }] } },
  defaultProps: { heading: 'You might also like', layout: 'Grid' },
  render: ShopUpsellProducts,
}

export const shopUpsellProductsPuckRscComponent = shopUpsellProductsPuckComponent
