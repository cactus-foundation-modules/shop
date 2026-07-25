import { connection } from 'next/server'
import { getSessionFromCookie } from '@/lib/auth/session'
import { CartSummaryClient } from '@/modules/shop/components/public/CartSummaryClient'
import { shopCartSummaryPuckComponent, type ShopCartSummaryProps } from './ShopCartSummary'

// Server (RSC) half of Shop: Cart Summary. Kept out of the client editor bundle
// because the 'Admins only' audience gate reads the admin session cookie via
// @/lib/auth/session (next/headers + Prisma) - server-only. The editor half in
// ShopCartSummary.tsx must stay client-safe. See ShopProductGrid.rsc for the
// same split.

// RSC render: a thin server wrapper around the client island, passing only plain
// props across the boundary. When `audience` is 'admin' the widget is withheld
// from the public and only rendered for a signed-in site admin; 'everyone' (the
// default) skips the session read entirely so the common case stays cacheable.
// (Field is `audience`, not `visibility` - core strips a same-named responsive
// field from render props, which swallowed the gate when this shipped as
// `visibility`.)
export async function ShopCartSummaryRsc(props: ShopCartSummaryProps) {
  if (props.audience === 'admin') {
    // connection() opts this render out of static caching so the cookie check
    // runs per-request - otherwise an admin's view could be cached and served
    // to the public, or vice versa.
    await connection()
    const admin = await getSessionFromCookie()
    if (!admin) return null
  }
  // Strip Puck's injected `puck`/`editMode` bag (live functions) before crossing
  // the client boundary - spreading it would trip React's "Functions cannot be
  // passed directly to Client Components" the moment this block lands in a
  // published header layout (the exact 500 ShopCartFull hit on the cart page).
  const options = { ...props } as Record<string, unknown>
  delete options.puck
  delete options.editMode
  return <CartSummaryClient {...(options as ShopCartSummaryProps)} />
}

export const shopCartSummaryPuckRscComponent = {
  ...shopCartSummaryPuckComponent,
  render: ShopCartSummaryRsc,
}
