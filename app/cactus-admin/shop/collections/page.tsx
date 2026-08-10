import { getSessionFromCookie } from '@/lib/auth/session'
import { hasShopPermission } from '@/modules/shop/lib/access'
import { CollectionsScreen } from '@/modules/shop/components/admin/CollectionsScreen'
import { ShopSectionNav } from '@/modules/shop/components/admin/ShopSectionNav'
import { resolveCatalogueNavTabs } from '@/modules/shop/lib/admin-nav'

export const metadata = { title: 'Shop Collections — Admin' }

export default async function ShopCollectionsPage() {
  const user = await getSessionFromCookie()
  if (!user) return null
  const canAccess = await hasShopPermission(user, 'shop.products', { allowAccess: true })
  if (!canAccess) return <div className="alert alert-danger">You do not have permission to view Shop collections.</div>
  const navTabs = await resolveCatalogueNavTabs(user)
  return (
    <div>
      <ShopSectionNav tabs={navTabs} active="collections" />
      <CollectionsScreen />
    </div>
  )
}
