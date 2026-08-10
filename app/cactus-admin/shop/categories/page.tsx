import { getSessionFromCookie } from '@/lib/auth/session'
import { hasShopPermission } from '@/modules/shop/lib/access'
import { CategoriesScreen } from '@/modules/shop/components/admin/CategoriesScreen'
import { ShopSectionNav } from '@/modules/shop/components/admin/ShopSectionNav'
import { resolveCatalogueNavTabs } from '@/modules/shop/lib/admin-nav'

export const metadata = { title: 'Shop Categories — Admin' }

export default async function ShopCategoriesPage() {
  const user = await getSessionFromCookie()
  if (!user) return null
  const canAccess = await hasShopPermission(user, 'shop.products', { allowAccess: true })
  if (!canAccess) return <div className="alert alert-danger">You do not have permission to view Shop categories.</div>
  const navTabs = await resolveCatalogueNavTabs(user)
  return (
    <div>
      <ShopSectionNav tabs={navTabs} active="categories" />
      <CategoriesScreen />
    </div>
  )
}
