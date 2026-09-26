// Where a supplier's page lives. One place, because the route, the sitemap, the
// menu builder and the product page's supplier link all have to agree, and a
// literal repeated five times is a literal that eventually disagrees with itself.
//
// Fixed at /shop/suppliers/ rather than following the wording a shop picked for
// the field (Supplier, Manufacturer, Retailer...): the label is a display choice
// an owner may change on a whim, and a changed label must not silently move
// every supplier page and break the links pointing at them.
export const SUPPLIER_BASE_PATH = '/shop/suppliers'

export function supplierHref(slug: string): string {
  return `${SUPPLIER_BASE_PATH}/${slug}`
}

/**
 * A supplier's page address, or null where following it would land on a 404.
 *
 * The same two switches the page itself checks (app/public/shop/suppliers/
 * [slug]/page.tsx): the shop publishes supplier pages at all, and this supplier's
 * own page is published. Anything short of both prints the name unlinked, which
 * is what every caller wants - a supplier's name reads perfectly well as text,
 * and a link that goes nowhere is worse than none.
 */
export function supplierPageHref(
  config: { supplierFieldEnabled: boolean; supplierPagesEnabled: boolean },
  supplier: { slug: string | null; storefrontVisible: boolean } | null | undefined,
): string | null {
  if (!config.supplierFieldEnabled || !config.supplierPagesEnabled) return null
  if (!supplier?.storefrontVisible || !supplier.slug) return null
  return supplierHref(supplier.slug)
}
