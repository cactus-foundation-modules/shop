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

// Customer Communications tab (spec 17, Q12) - shop's side of the Reply
// Catcher integration only. Hidden unless another module (e.g. Reply Catcher)
// actually contributes to the `shop.order-messages` point; the contribution
// itself is out of scope here.
async function resolveOrderMessageSections(user: Awaited<ReturnType<typeof getSessionFromCookie>>) {
  if (!user) return []
  const modules = await prisma.module.findMany({ where: { ...INSTALLED_MODULE_WHERE }, select: { manifest: true } })
  const ids: string[] = []
  for (const mod of modules) {
    const manifest = mod.manifest as { extensionPoints?: ExtensionPointEntry[] } | null
    if (!manifest?.extensionPoints) continue
    for (const entry of manifest.extensionPoints) {
      if (entry.point !== 'shop.order-messages') continue
      if (!entry.permission || (await hasPermission(user, entry.permission))) ids.push(entry.id)
    }
  }
  return ids
}

export default async function ShopOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionFromCookie()
  if (!user) return null
  const canAccess = await hasShopPermission(user, 'shop.orders', { allowAccess: true })
  if (!canAccess) return <div className="alert alert-danger">You do not have permission to view this order.</div>

  const { id } = await params
  const order = await getOrderById(id)
  const sectionIds = await resolveOrderMessageSections(user)
  const sectionComponents = moduleExtensionPointComponents['shop.order-messages'] ?? {}

  return (
    <OrderDetailScreen orderId={id}>
      {order && sectionIds.length > 0 && (
        <section>
          <h3 style={{ fontSize: '0.9375rem' }}>Customer Communications</h3>
          {sectionIds.map((sid) => {
            const Section = sectionComponents[sid]
            return Section ? <Section key={sid} orderId={order.id} orderNumber={order.orderNumber} customerEmail={order.customerEmail} /> : null
          })}
        </section>
      )}
    </OrderDetailScreen>
  )
}
