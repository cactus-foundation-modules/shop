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
