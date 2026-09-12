import { describe, it, expect } from 'vitest'
import { Suspense, type ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { ShopProductGridRsc } from '@/modules/shop/components/puck/ShopProductGrid.rsc'
import { ShopFeaturedCollectionRsc } from '@/modules/shop/components/puck/ShopFeaturedCollection.rsc'
import { ShopRelatedProductsRsc } from '@/modules/shop/components/puck/ShopRelatedProducts.rsc'

// A grid block is an async server component, and an async component with no
// Suspense boundary above it blocks the ENTIRE first flush - so the header, the
// hero and every other block on the page wait for the slowest product query on
// it.
//
// MEASURED ON THE LIVE SITE, cold: the homepage carried five grid blocks and 24
// cards and took 2.9 seconds to its first byte. The guided finder's own page,
// which does considerably more work - five hundred products, every filter run
// over all of them, priced and ordered - took 0.70s, because that block had
// already been put behind a boundary. Same work, different first byte.
//
// The fix only works if the boundary sits OUTSIDE the async work. A `<Suspense>`
// written inside an async component has already awaited everything by the time
// React sees it: it looks identical in review, typechecks, lints, renders byte
// for byte the same markup, and streams nothing at all. So the SHAPE is the fix,
// and the shape is what this guards - for all three grid blocks, because the
// next person to add one will copy whichever they open first.
//
// Nothing else catches this. The only symptom is a slow first byte on somebody
// else's machine.

const BLOCKS = [
  ['Shop: Product Grid', ShopProductGridRsc],
  ['Shop: Featured Collection', ShopFeaturedCollectionRsc],
  ['Shop: Related Products', ShopRelatedProductsRsc],
] as const

describe('every shop grid streams rather than blocking the first byte', () => {
  for (const [label, Block] of BLOCKS) {
    describe(label, () => {
      it('is not an async component', () => {
        // An async function's constructor is AsyncFunction. Awaiting the whole
        // grid before returning is exactly what this prevents.
        expect(Block.constructor.name).toBe('Function')
      })

      it('returns a Suspense boundary with a fallback', () => {
        // Called with no props at all: handing back the boundary must not need
        // the database, which is the whole point of the split.
        const el = Block({} as Parameters<typeof Block>[0]) as ReactElement<{ fallback?: unknown }>
        expect(el.type).toBe(Suspense)
        expect(el.props.fallback).toBeTruthy()
      })

      it('reserves tiles, so the page below does not jump when the cards land', () => {
        const el = Block({} as Parameters<typeof Block>[0]) as ReactElement<{ fallback?: ReactElement }>
        const html = renderToStaticMarkup(el.props.fallback as ReactElement)
        // A grid of placeholders in a real column count - not an empty div,
        // which would reserve nothing and jump the moment the cards arrive.
        expect(html).toMatch(/grid-template-columns:repeat\(\d+,/)
        expect(html).toMatch(/aspect-ratio/)
        // And it says something is coming, because a screen reader meeting an
        // empty box deserves to be told.
        expect(html).toContain('aria-busy')
      })
    })
  }
})
