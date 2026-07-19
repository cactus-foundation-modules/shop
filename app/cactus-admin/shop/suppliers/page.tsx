import { getSessionFromCookie } from '@/lib/auth/session'
import { hasShopPermission } from '@/modules/shop/lib/access'
import { getShopConfig, resolveSupplierLabel } from '@/modules/shop/lib/config'
import { syncSupplierNavEntry } from '@/modules/shop/lib/supplier-nav'
import { SuppliersScreen } from '@/modules/shop/components/admin/SuppliersScreen'

export const metadata = { title: 'Shop Suppliers — Admin' }

export default async function ShopSuppliersPage() {
  const user = await getSessionFromCookie()
  if (!user) return null
  const canAccess = await hasShopPermission(user, 'shop.products', { allowAccess: true })
  if (!canAccess) return <div className="alert alert-danger">You do not have permission to view Shop suppliers.</div>

  const config = await getShopConfig()
  // Self-heal the sidebar link, which a module update resets - see supplier-nav.ts.
  await syncSupplierNavEntry(config.supplierFieldEnabled)

  return <SuppliersScreen label={resolveSupplierLabel(config)} enabled={config.supplierFieldEnabled} />
}
