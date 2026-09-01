import type { LayoutRef } from '@/lib/puck/LayoutPickerField'

// Types only, in a file of their own on purpose. Two different kinds of file
// need them and neither may import the module that does the work:
//
//  - grid-cards-action.tsx is a 'use server' file, and Next allows a server
//    file to export async functions and nothing else.
//  - the client pagers name the server function in a prop type, and a client
//    file that imports anything reaching prisma fails the build-time client
//    graph check (scripts/check-client-graph.mjs). `import type` is the one
//    edge that genuinely erases.

/** What a grid block is pointed at: everything the product query needs, nothing
 *  else. Bound into the server function and encrypted by Next on the way out, so
 *  it is not the shopper's to edit - but see listGridProducts, which re-runs the
 *  authorising query regardless. */
export type ShopGridScope = {
  categorySlug?: string
  collectionSlug?: string
  tagSlug?: string
  /** Absent means "listProducts' own default", which is what the filter grid has
   *  always passed. Shop's own grid always names one. */
  sort?: string
  /** The block's own ceiling, already clamped by the caller. */
  fetchCount: number
  /** Leave out the products an owner has kept off the featured shelves. The
   *  showcase blocks pass true; a browse-and-filter grid does not, because a
   *  shopper narrowing a category is not being shown a showcase. Absent means
   *  false, which is what every scope meant before this existed. */
  excludeFeaturedHidden?: boolean
}

/** Which slice of the scope's products a caller wants cards for. Shop's own grid
 *  counts (it shows the server's order); the filter grid names ids (it shows what
 *  the shopper's ticks have left, in whatever order they sorted it). */
export type ShopGridWindow = { offset: number; count: number } | { ids: string[] }

/** Everything the block decides and the browser may not: which products, which
 *  card design, and how many cards one call may render. */
export type ShopGridBinding = {
  scope: ShopGridScope
  layoutRef?: LayoutRef | null
  maxCards: number
}

/** The prop shape a pager receives. Declared here so a client component can name
 *  it with `import type` and never reach the server module behind it. */
export type ShopGridCardLoader = (window: ShopGridWindow) => Promise<React.ReactNode[]>
