import { getSessionFromCookie } from '@/lib/auth/session'
import { hasShopPermission } from '@/modules/shop/lib/access'
import { RequestsScreen } from '@/modules/shop/components/admin/RequestsScreen'
import { ShopSectionNav } from '@/modules/shop/components/admin/ShopSectionNav'
import { resolveTradingNavTabs } from '@/modules/shop/lib/admin-nav'

export const metadata = { title: 'Cancellations & returns — Admin' }

export default async function ShopRequestsPage() {
  const user = await getSessionFromCookie()
  if (!user) return null
  const canAccess = await hasShopPermission(user, 'shop.orders', { allowAccess: true })
  if (!canAccess) return <div className="alert alert-danger">You do not have permission to view Shop orders.</div>
  const navTabs = await resolveTradingNavTabs(user)
  return (
    <div>
      <ShopSectionNav tabs={navTabs} active="requests" />
      <RequestsScreen />
    </div>
  )
}
