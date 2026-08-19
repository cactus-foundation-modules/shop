// Request-scoped holder for the product page's query string, so companion
// modules can read the selection a shared link carries without shop knowing
// what any of the parameters mean.
//
// Why it exists: a shopper configuring a product writes their picks into the
// URL (each module its own parameters - shop-variations the option choices,
// product-addons the ticked accessories). When that link is opened, the modules
// need those parameters back while the page - and its metadata - render on the
// server. Next only hands searchParams to the page and generateMetadata
// entries, and shop rightly knows nothing about other modules' parameter
// names, so the raw map is parked here for whoever knows how to read it.
// Same cache() trick as shop-variations' variation-bootstrap slots: one holder
// per request, never shared between two shoppers.
import { cache } from 'react'

export type ProductPageSearchParams = Record<string, string | string[] | undefined>

const paramsSlotRef = cache((): { searchParams: ProductPageSearchParams | null } => ({ searchParams: null }))

export function rememberProductPageSearchParams(searchParams: ProductPageSearchParams): void {
  paramsSlotRef().searchParams = searchParams
}

export function currentProductPageSearchParams(): ProductPageSearchParams | null {
  return paramsSlotRef().searchParams
}
