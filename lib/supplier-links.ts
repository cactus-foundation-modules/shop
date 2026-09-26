// Supplier page links for the order-size deduction's basket notes.
//
// Server-only: reads the supplier rows. Kept apart from the pure rule module
// (lib/order-size-deduction.ts), which the storefront bundle imports and which
// must stay free of the data layer.
import { getSupplierByName } from '@/modules/shop/lib/db/suppliers'
import { supplierPageHref } from '@/modules/shop/lib/supplier-url'

/**
 * Where each named supplier's page lives, keyed on the name exactly as given.
 * A supplier with no published page is simply absent.
 *
 * No query at all unless the shop publishes supplier pages and there is a name
 * to look up - which is every basket on every shop bar the few with a
 * deduction note to print, and those carry one or two suppliers at most.
 */
export async function supplierPageLinks(
  config: { supplierFieldEnabled: boolean; supplierPagesEnabled: boolean },
  names: readonly string[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  if (!config.supplierFieldEnabled || !config.supplierPagesEnabled) return out
  const unique = [...new Set(names)]
  const rows = await Promise.all(unique.map((name) => getSupplierByName(name)))
  unique.forEach((name, i) => {
    const href = supplierPageHref(config, rows[i])
    if (href) out.set(name, href)
  })
  return out
}
