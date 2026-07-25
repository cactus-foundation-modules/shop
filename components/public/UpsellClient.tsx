'use client'

import { useEffect, useState } from 'react'
import { getCart, subscribeCart } from '@/modules/shop/components/public/cart'
import { formatMoney } from '@/modules/shop/lib/money'

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
    if (getCart().length > 0) {
      let cancelled = false
      fetch('/api/m/shop/public/config')
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => { if (!cancelled && data) setCurrencySymbol(data.currencySymbol) })
        .catch(() => {})
      return () => { cancelled = true }
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    // Suggestions depend only on WHICH products are in the cart, so refresh
    // only when that membership changes. Quantity tweaks and per-line option
    // picks (a delivery tier, say) fire cart events too, and each used to
    // re-run the whole strip - now they're ignored.
    let lastMembership = ''

    async function refresh() {
      const ids = [...new Set(getCart().map((l) => l.productId))].sort()
      const membership = ids.join(',')
      if (membership === lastMembership) return
      lastMembership = membership
      if (ids.length === 0) { setProducts([]); return }

      // One request for the whole cart - the strip used to list the entire
      // catalogue and then fetch each cart product's upsells one by one.
      const res = await fetch('/api/m/shop/public/cart/upsells', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ productIds: ids }),
      })
      if (cancelled || !res.ok) return
      const { products: suggested } = await res.json()
      if (!cancelled) setProducts((suggested as UpsellProduct[]).slice(0, 4))
    }

    refresh()
    const unsubscribe = subscribeCart(refresh)
    return () => { cancelled = true; unsubscribe() }
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
                <span className="spu-price">{formatMoney(p.price, currencySymbol)}</span>
              </a>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
