import { getSessionFromCookie } from '@/lib/auth/session'
import { hasShopPermission } from '@/modules/shop/lib/access'
import { CategoriesScreen } from '@/modules/shop/components/admin/CategoriesScreen'

export const metadata = { title: 'Shop Categories — Admin' }

export default async function ShopCategoriesPage() {
  const user = await getSessionFromCookie()
  if (!user) return null
  const canAccess = await hasShopPermission(user, 'shop.products', { allowAccess: true })
  if (!canAccess) return <div className="alert alert-danger">You do not have permission to view Shop categories.</div>
  return <CategoriesScreen />
}
