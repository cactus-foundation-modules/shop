import { getSessionFromCookie } from '@/lib/auth/session'
import { hasShopPermission } from '@/modules/shop/lib/access'
import { DiscountsScreen } from '@/modules/shop/components/admin/DiscountsScreen'

export const metadata = { title: 'Shop Discounts — Admin' }

export default async function ShopDiscountsPage() {
  const user = await getSessionFromCookie()
  if (!user) return null
  const canAccess = await hasShopPermission(user, 'shop.discounts', { allowAccess: true })
  if (!canAccess) return <div className="alert alert-danger">You do not have permission to view Shop discounts.</div>
  return <DiscountsScreen />
}
