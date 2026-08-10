import { getSessionFromCookie } from '@/lib/auth/session'
import { hasShopPermission } from '@/modules/shop/lib/access'
import { TagsScreen } from '@/modules/shop/components/admin/TagsScreen'
import { ShopSectionNav } from '@/modules/shop/components/admin/ShopSectionNav'
import { resolveCatalogueNavTabs } from '@/modules/shop/lib/admin-nav'

export const metadata = { title: 'Shop Tags — Admin' }

export default async function ShopTagsPage() {
  const user = await getSessionFromCookie()
  if (!user) return null
  const canAccess = await hasShopPermission(user, 'shop.products', { allowAccess: true })
  if (!canAccess) return <div className="alert alert-danger">You do not have permission to view Shop tags.</div>
  const navTabs = await resolveCatalogueNavTabs(user)
  return (
    <div>
      <ShopSectionNav tabs={navTabs} active="tags" />
      <TagsScreen />
    </div>
  )
}
