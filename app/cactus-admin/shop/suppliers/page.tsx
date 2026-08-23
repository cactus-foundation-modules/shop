import { getSessionFromCookie } from '@/lib/auth/session'
import { hasShopPermission } from '@/modules/shop/lib/access'
import { getShopConfig, resolveSupplierLabel } from '@/modules/shop/lib/config'
import { SuppliersScreen } from '@/modules/shop/components/admin/SuppliersScreen'
import { ShopSectionNav } from '@/modules/shop/components/admin/ShopSectionNav'
import { resolveTradingNavTabs } from '@/modules/shop/lib/admin-nav'

export const metadata = { title: 'Shop Suppliers — Admin' }

// A tab on the Trading strip rather than a sidebar link of its own. The strip
// only offers this tab while the supplier field is switched on, but the page
// itself stays reachable either way so an old bookmark still lands somewhere
// that explains itself (SuppliersScreen handles the switched-off case).
export default async function ShopSuppliersPage() {
  const user = await getSessionFromCookie()
  if (!user) return null
  const canAccess = await hasShopPermission(user, 'shop.products', { allowAccess: true })
  if (!canAccess) return <div className="alert alert-danger">You do not have permission to view Shop suppliers.</div>

  const [config, navTabs] = await Promise.all([getShopConfig(), resolveTradingNavTabs(user)])

  return (
    <div>
      <ShopSectionNav tabs={navTabs} active="suppliers" />
      <SuppliersScreen label={resolveSupplierLabel(config)} enabled={config.supplierFieldEnabled} />
    </div>
  )
}
