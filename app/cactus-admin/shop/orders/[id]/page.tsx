import { getSessionFromCookie } from '@/lib/auth/session'
import { hasPermission } from '@/lib/permissions/check'
import { hasShopPermission } from '@/modules/shop/lib/access'
import { OrderDetailScreen } from '@/modules/shop/components/admin/OrderDetailScreen'
import { getOrderById } from '@/modules/shop/lib/db/orders'
import { prisma } from '@/lib/db/prisma'
import { INSTALLED_MODULE_WHERE } from '@/lib/modules/live-status'
import { moduleExtensionPointComponents } from '@/lib/modules/extension-points'

export const metadata = { title: 'Order — Admin' }

type ExtensionPointEntry = { point: string; id: string; permission?: string }

// The two points this screen offers, and who may see what is registered on them.
//
//   shop.order-messages      - Customer Communications (spec 17, Q12), shop's
//                              side of the Reply Catcher integration. Rendered
//                              together inside one shared card.
//   shop.order-detail-panels - a whole card of its own about this order, from a
//                              module that has something to do with it: raising
//                              a purchase order off it, say. Each contributor
//                              draws its own <section className="sox-card">;
//                              nothing is wrapped for it.
//
// PROP CONTRACT for shop.order-detail-panels, since nothing in the platform
// declares or enforces one - the host picks the props at the JSX call site
// below, and a contributor expecting different ones simply renders nothing:
//
//   orderId: string      - shp_orders.id
//   orderNumber: string  - the human reference, e.g. "DW000135"
//   orderStatus: string  - shp_orders.status, e.g. "PAID"
//
// Contributors must be server components and must tolerate being rendered on
// an order they have nothing to say about (render null, not an empty card).
const MESSAGES_POINT = 'shop.order-messages'
const PANELS_POINT = 'shop.order-detail-panels'

// Which contributors on each point this user may see. One read of the installed
// manifests covers both points - the query is the expensive half, and there is
// no reason to run it once per point.
//
// The per-entry `permission` gate is honoured HERE and nowhere else: the
// generated extension-point map drops the field entirely, so this host is the
// only thing standing between a contributor and a user without its permission.
async function resolveExtensionPointIds(
  user: Awaited<ReturnType<typeof getSessionFromCookie>>,
  points: readonly string[],
): Promise<Record<string, string[]>> {
  const found: Record<string, string[]> = Object.fromEntries(points.map((p) => [p, []]))
  if (!user) return found
  const modules = await prisma.module.findMany({ where: { ...INSTALLED_MODULE_WHERE }, select: { manifest: true } })
  for (const mod of modules) {
    const manifest = mod.manifest as { extensionPoints?: ExtensionPointEntry[] } | null
    if (!manifest?.extensionPoints) continue
    for (const entry of manifest.extensionPoints) {
      if (!points.includes(entry.point)) continue
      if (!entry.permission || (await hasPermission(user, entry.permission))) found[entry.point]!.push(entry.id)
    }
  }
  return found
}

export default async function ShopOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionFromCookie()
  if (!user) return null
  const canAccess = await hasShopPermission(user, 'shop.orders', { allowAccess: true })
  if (!canAccess) return <div className="alert alert-danger">You do not have permission to view this order.</div>

  const { id } = await params
  const order = await getOrderById(id)
  const ids = await resolveExtensionPointIds(user, [MESSAGES_POINT, PANELS_POINT])
  const sectionIds = ids[MESSAGES_POINT] ?? []
  const panelIds = ids[PANELS_POINT] ?? []
  const sectionComponents = moduleExtensionPointComponents[MESSAGES_POINT] ?? {}
  const panelComponents = moduleExtensionPointComponents[PANELS_POINT] ?? {}

  return (
    <OrderDetailScreen orderId={id}>
      {order && sectionIds.length > 0 && (
        // Rendered inside the order screen's main column, so it wears the same
        // card as everything else there rather than being a bare heading.
        <section className="sox-card">
          <div className="sox-card-head"><h2>Customer communications</h2></div>
          <div className="sox-card-body">
            {sectionIds.map((sid) => {
              const Section = sectionComponents[sid]
              return Section ? <Section key={sid} orderId={order.id} orderNumber={order.orderNumber} customerEmail={order.customerEmail} /> : null
            })}
          </div>
        </section>
      )}
      {order && panelIds.map((pid) => {
        const Panel = panelComponents[pid]
        return Panel ? <Panel key={pid} orderId={order.id} orderNumber={order.orderNumber} orderStatus={order.status} /> : null
      })}
    </OrderDetailScreen>
  )
}
