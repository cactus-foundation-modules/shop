import { getSessionFromCookie } from '@/lib/auth/session'
import { hasShopPermission } from '@/modules/shop/lib/access'
import { ProductsScreen } from '@/modules/shop/components/admin/ProductsScreen'

export const metadata = { title: 'Shop Products — Admin' }

export default async function ShopProductsPage() {
  const user = await getSessionFromCookie()
  if (!user) return null
  const canAccess = await hasShopPermission(user, 'shop.products', { allowAccess: true })
  if (!canAccess) return <div className="alert alert-danger">You do not have permission to view Shop products.</div>

  return <ProductsScreen />
}
