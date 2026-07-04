import { getSessionFromCookie } from '@/lib/auth/session'
import { hasShopPermission } from '@/modules/shop/lib/access'
import { OrdersScreen } from '@/modules/shop/components/admin/OrdersScreen'

export const metadata = { title: 'Shop Orders — Admin' }

export default async function ShopOrdersPage() {
  const user = await getSessionFromCookie()
  if (!user) return null
  const canAccess = await hasShopPermission(user, 'shop.orders', { allowAccess: true })
  if (!canAccess) return <div className="alert alert-danger">You do not have permission to view Shop orders.</div>
  return <OrdersScreen />
}
