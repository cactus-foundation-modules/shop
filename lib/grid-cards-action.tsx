'use server'

import { resolveCardTemplate, renderCards, MinimalCard } from '@/modules/shop/lib/card-template'
import { listGridProducts, buildGridCardItems } from '@/modules/shop/lib/grid-page'
import { pickWindow } from '@/modules/shop/lib/grid-window'
import type { ShopGridBinding, ShopGridWindow } from '@/modules/shop/lib/grid-page-types'

// The server function behind Shop: Product Grid's on-demand paging. It renders
// the same cards the block itself renders, through the same helpers, and hands
// them back as React nodes - NOT as HTML.
//
// That distinction is the whole reason this is a server function rather than a
// route handler returning markup. A card carries client islands: the picture
// carousel with its arrows and hover-swap, and whatever a companion module has
// mounted in the overlay (the "view in 3D" button, today). Markup injected into
// the page with innerHTML would arrive dead - it never hydrates, because React
// knows nothing about it. Nodes returned from a server function travel the same
// flight channel the first page did, so page two behaves exactly like page one.
//
// `binding` is bound at render time by the block and encrypted by Next before it
// reaches the browser, so the shopper cannot edit which products a grid is
// pointed at. Belt and braces anyway: listGridProducts re-runs the block's own
// authorising query on every call, so the worst a forged request could do is ask
// for cards from the same public, in-stock, non-hidden list it was already
// looking at. See pickWindow for what happens to an id that is not on it.
export async function loadShopGridCards(
  binding: ShopGridBinding,
  window: ShopGridWindow,
): Promise<React.ReactNode[]> {
  const products = await listGridProducts(binding.scope)
  const wanted = pickWindow(products, window, binding.maxCards)
  if (wanted.length === 0) return []
  const [items, template] = await Promise.all([
    buildGridCardItems(wanted),
    resolveCardTemplate(binding.layoutRef),
  ])
  // Same fall-back as the block's own first page: no published card layout at
  // all leaves every page on the safety-net card rather than page one on one
  // design and page two on another.
  return template ? await renderCards(template, items) : items.map((item) => <MinimalCard key={item.product.id} {...item} />)
}

// The category filter bar's server function. Same cards, same helpers, same
// order as the block's own render - the only thing a pill changes is which
// category the block's scope is narrowed to, so a "Best sellers" shelf stays in
// popularity order inside every category. `binding` arrives bound and encrypted;
// the slug is the one thing the browser supplies, and it is only ever a narrower
// filter on the public list listGridProducts already authorises.
export async function loadShopGridCategoryCards(
  binding: ShopGridBinding,
  categorySlug: string | null,
): Promise<React.ReactNode[]> {
  const slug = typeof categorySlug === 'string' ? categorySlug.trim().slice(0, 200) : ''
  const scoped: ShopGridBinding = slug ? { ...binding, scope: { ...binding.scope, categorySlug: slug } } : binding
  return loadShopGridCards(scoped, { offset: 0, count: binding.maxCards })
}
