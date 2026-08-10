import { resolveExtensionTabs } from '@/lib/modules/extension-tabs'
import { hasShopPermission, type ShopPermissionKey } from '@/modules/shop/lib/access'
import type { SessionUser } from '@/lib/auth/session'

// ---------------------------------------------------------------------------
// The shop's two admin sections and the tabs inside them.
//
// The shop used to take nine sidebar links and its companion modules another
// five on top. It now takes two - Catalogue and Sales - with everything else as
// a tab on one of those pages. This module works out which tabs a given user may
// see, so every page in a section renders the same strip and none of them offers
// a link the role would be bounced off.
//
// Contributed tabs (a companion module's own screen) live on the section's first
// page behind ?tab=<id>, which is why their href points there rather than at a
// route of their own.
// ---------------------------------------------------------------------------

export type ShopNavTab = {
  key: string
  label: string
  /** Path relative to the admin root, e.g. '/m/shop/orders'. */
  path: string
}

type BuiltIn = { key: string; label: string; path: string; permission: ShopPermissionKey; allowAccess?: boolean }

const CATALOGUE_BUILT_INS: BuiltIn[] = [
  { key: 'products', label: 'Products', path: '/m/shop/products', permission: 'shop.products', allowAccess: true },
  { key: 'categories', label: 'Categories', path: '/m/shop/categories', permission: 'shop.products', allowAccess: true },
  { key: 'collections', label: 'Collections', path: '/m/shop/collections', permission: 'shop.products', allowAccess: true },
  { key: 'tags', label: 'Tags', path: '/m/shop/tags', permission: 'shop.products', allowAccess: true },
]

const SALES_BUILT_INS: BuiltIn[] = [
  { key: 'orders', label: 'Orders', path: '/m/shop/orders', permission: 'shop.orders', allowAccess: true },
  { key: 'requests', label: 'Cancellations & returns', path: '/m/shop/requests', permission: 'shop.orders', allowAccess: true },
  { key: 'customers', label: 'Customers', path: '/m/shop/customers', permission: 'shop.customers', allowAccess: true },
  { key: 'discounts', label: 'Discounts', path: '/m/shop/discounts', permission: 'shop.discounts', allowAccess: true },
  { key: 'reports', label: 'Reports', path: '/m/shop/reports', permission: 'shop.reports' },
  // Tax and shipping reads like settings and was headed for the Settings page,
  // but it hosts other modules' panels (`shop.tax-shipping-tabs`) which only a
  // server component can resolve - and core's settings page has no business
  // knowing a shop-specific extension point. So it stays a page of its own and
  // rides the Sales strip instead. Still no sidebar link either way.
  { key: 'tax-shipping', label: 'Tax & shipping', path: '/m/shop/tax-shipping', permission: 'shop.manage', allowAccess: true },
]

async function build(
  user: SessionUser | null,
  builtIns: BuiltIn[],
  point: string,
  hostPath: string
): Promise<ShopNavTab[]> {
  if (!user) return []
  const tabs: ShopNavTab[] = []
  for (const item of builtIns) {
    if (!(await hasShopPermission(user, item.permission, { allowAccess: item.allowAccess }))) continue
    tabs.push({ key: item.key, label: item.label, path: item.path })
  }
  // resolveExtensionTabs has already dropped anything this role may not open.
  for (const tab of await resolveExtensionTabs(point, user)) {
    tabs.push({ key: tab.id, label: tab.label, path: `${hostPath}?tab=${encodeURIComponent(tab.id)}` })
  }
  return tabs
}

/** Products, Categories, Collections, Tags, plus whatever fills `shop.products-tabs`. */
export function resolveCatalogueNavTabs(user: SessionUser | null): Promise<ShopNavTab[]> {
  return build(user, CATALOGUE_BUILT_INS, 'shop.products-tabs', '/m/shop/products')
}

/** Orders through Reports, plus whatever fills `shop.orders-tabs`. */
export function resolveSalesNavTabs(user: SessionUser | null): Promise<ShopNavTab[]> {
  return build(user, SALES_BUILT_INS, 'shop.orders-tabs', '/m/shop/orders')
}
