'use client'

import { useEffect, useState } from 'react'
import { getCart, subscribeCart } from '@/modules/shop/components/public/cart'

type UpsellProduct = { id: string; slug: string; name: string; price: string }

// "Step up to..." upsell banner. The upsell API returns name/slug/price only
// (no image), so this matches the concept's highlighted teal banner rather
// than an image card grid. Class prefix `spu-` (shop product upsell).
const UPSELL_CSS = `
.spu-banner{border:1px solid var(--color-primary);border-radius:16px;background:var(--color-primary-subtle);padding:22px 26px;display:flex;gap:18px;align-items:flex-start;margin-top:8px;flex-wrap:wrap}
.spu-glyph{width:48px;height:48px;border-radius:10px;background:var(--color-primary);color:var(--color-on-primary);display:flex;align-items:center;justify-content:center;flex:none}
.spu-body{flex:1;min-width:220px}
.spu-title{font-family:var(--display-family,Georgia,serif);font-weight:600;font-size:20px;display:block;color:var(--color-fg);margin-bottom:12px;line-height:1.2}
.spu-items{display:flex;gap:10px;flex-wrap:wrap}
.spu-item{display:inline-flex;align-items:center;gap:8px;border:1px solid var(--color-border);background:var(--color-surface);border-radius:9999px;padding:8px 14px;text-decoration:none;color:var(--color-fg);font-size:14px;transition:border-color .12s ease,box-shadow .12s ease}
.spu-item:hover{border-color:var(--color-primary);box-shadow:0 1px 3px rgba(0,0,0,.06)}
.spu-name{font-weight:600}
.spu-price{color:var(--color-primary);font-weight:600}
`

// Client island for the cart-driven upsell strip. Registered Puck block wrapper
// (ShopUpsellProducts) is a server component that passes plain props here.
export function UpsellClient({ heading }: { heading?: string }) {
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
      <style dangerouslySetInnerHTML={{ __html: UPSELL_CSS }} />
      <div className="spu-banner">
        <div className="spu-glyph">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M12 2l2.9 6.3L22 9.3l-5 4.9 1.2 6.9L12 17.8 5.8 21l1.2-6.9-5-4.9 7.1-1z" strokeLinejoin="round" />
          </svg>
        </div>
        <div className="spu-body">
          <b className="spu-title">{heading || 'Step up your setup'}</b>
          <div className="spu-items">
            {products.map((p) => (
              <a key={p.id} href={`/shop/products/${p.slug}`} className="spu-item">
                <span className="spu-name">{p.name}</span>
                <span className="spu-price">{currencySymbol}{p.price}</span>
              </a>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
