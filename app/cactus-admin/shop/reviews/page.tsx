import { getSessionFromCookie } from '@/lib/auth/session'
import { hasShopPermission } from '@/modules/shop/lib/access'
import { ReviewsScreen } from '@/modules/shop/components/admin/ReviewsScreen'

export const metadata = { title: 'Shop Reviews — Admin' }

export default async function ShopReviewsPage() {
  const user = await getSessionFromCookie()
  if (!user) return null
  const canAccess = await hasShopPermission(user, 'shop.products', { allowAccess: true })
  if (!canAccess) return <div className="alert alert-danger">You do not have permission to view Shop reviews.</div>
  return <ReviewsScreen />
}
