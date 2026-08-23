import { getSessionFromCookie } from '@/lib/auth/session'
import { hasShopPermission } from '@/modules/shop/lib/access'
import { OrdersScreen } from '@/modules/shop/components/admin/OrdersScreen'
import { ShopSectionNav } from '@/modules/shop/components/admin/ShopSectionNav'
import { resolveTradingNavTabs } from '@/modules/shop/lib/admin-nav'
import { resolveExtensionTabs } from '@/lib/modules/extension-tabs'

export const metadata = { title: 'Shop Orders — Admin' }

// The front of the Trading section: the orders list, the tab strip carrying
// cancellations, customers, discounts and reports, and the home for whatever a
// companion module publishes into `shop.orders-tabs` (quotes, today). A
// contributed tab opens with ?tab=<id> so the strip stays plain links that every
// page in the section can share.
export default async function ShopOrdersPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const user = await getSessionFromCookie()
  if (!user) return null
  const canAccess = await hasShopPermission(user, 'shop.orders', { allowAccess: true })
  if (!canAccess) return <div className="alert alert-danger">You do not have permission to view Shop orders.</div>

  const { tab } = await searchParams
  const [navTabs, contributed] = await Promise.all([
    resolveTradingNavTabs(user),
    resolveExtensionTabs('shop.orders-tabs', user),
  ])

  // An unknown ?tab= (a stale link, a module since removed) falls back to the
  // orders list rather than an empty page.
  const active = contributed.find((t) => t.id === tab) ?? null

  return (
    <div>
      <ShopSectionNav tabs={navTabs} active={active?.id ?? 'orders'} />
      {active ? <active.Component /> : <OrdersScreen />}
    </div>
  )
}
