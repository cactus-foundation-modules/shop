import { getSessionFromCookie } from '@/lib/auth/session'
import { hasShopPermission } from '@/modules/shop/lib/access'
import { CustomerDetailScreen } from '@/modules/shop/components/admin/CustomerDetailScreen'

export const metadata = { title: 'Customer — Admin' }

export default async function ShopCustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionFromCookie()
  if (!user) return null
  const canAccess = await hasShopPermission(user, 'shop.customers', { allowAccess: true })
  if (!canAccess) return <div className="alert alert-danger">You do not have permission to view this customer.</div>

  const { id } = await params
  return <CustomerDetailScreen email={decodeURIComponent(id)} />
}
