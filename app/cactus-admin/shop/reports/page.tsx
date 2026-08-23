import { getSessionFromCookie } from '@/lib/auth/session'
import { hasShopPermission } from '@/modules/shop/lib/access'
import { ReportsScreen } from '@/modules/shop/components/admin/ReportsScreen'
import { ShopSectionNav } from '@/modules/shop/components/admin/ShopSectionNav'
import { resolveTradingNavTabs } from '@/modules/shop/lib/admin-nav'

export const metadata = { title: 'Shop Reports — Admin' }

export default async function ShopReportsPage() {
  const user = await getSessionFromCookie()
  if (!user) return null
  const canAccess = await hasShopPermission(user, 'shop.reports')
  if (!canAccess) return <div className="alert alert-danger">You do not have permission to view Shop reports.</div>
  const navTabs = await resolveTradingNavTabs(user)
  return (
    <div>
      <ShopSectionNav tabs={navTabs} active="reports" />
      <ReportsScreen />
    </div>
  )
}
