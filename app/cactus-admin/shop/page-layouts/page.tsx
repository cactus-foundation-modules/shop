import { getSessionFromCookie } from '@/lib/auth/session'
import { hasShopPermission } from '@/modules/shop/lib/access'
import { PageLayoutsScreen } from '@/modules/shop/components/admin/PageLayoutsScreen'

export const metadata = { title: 'Storefront Layouts — Admin' }

export default async function ShopPageLayoutsPage() {
  const user = await getSessionFromCookie()
  if (!user) return null
  const canAccess = await hasShopPermission(user, 'shop.manage')
  if (!canAccess) return <div className="alert alert-danger">You do not have permission to edit storefront layouts.</div>
  return <PageLayoutsScreen />
}
