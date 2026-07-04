import { getSessionFromCookie } from '@/lib/auth/session'
import { hasShopPermission } from '@/modules/shop/lib/access'
import { CustomersScreen } from '@/modules/shop/components/admin/CustomersScreen'

export const metadata = { title: 'Shop Customers — Admin' }

export default async function ShopCustomersPage() {
  const user = await getSessionFromCookie()
  if (!user) return null
  const canAccess = await hasShopPermission(user, 'shop.customers', { allowAccess: true })
  if (!canAccess) return <div className="alert alert-danger">You do not have permission to view Shop customers.</div>
  return <CustomersScreen />
}
