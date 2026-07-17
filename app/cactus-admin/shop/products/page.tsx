import { getSessionFromCookie } from '@/lib/auth/session'
import { hasPermission } from '@/lib/permissions/check'
import { hasShopPermission } from '@/modules/shop/lib/access'
import { ProductsScreen } from '@/modules/shop/components/admin/ProductsScreen'
import { prisma } from '@/lib/db/prisma'
import { moduleExtensionPointComponents } from '@/lib/modules/extension-points'

export const metadata = { title: 'Shop Products — Admin' }

type ExtensionPointEntry = { point: string; id: string; permission?: string }

// Other modules (e.g. google-sheet-products-for-shop) hang controls beside the
// Products header buttons via the `shop.products-toolbar` point. Their components
// are resolved here and handed to the client screen, permission-gated per entry.
// A plain shop with nothing contributing simply gets no extras.
async function resolveToolbarExtras(user: Awaited<ReturnType<typeof getSessionFromCookie>>) {
  if (!user) return null
  const components = moduleExtensionPointComponents['shop.products-toolbar'] ?? {}
  const modules = await prisma.module.findMany({ where: { status: { in: ['active', 'update_available'] } }, select: { manifest: true } })
  const nodes: React.ReactNode[] = []
  for (const mod of modules) {
    const manifest = mod.manifest as { extensionPoints?: ExtensionPointEntry[] } | null
    for (const entry of manifest?.extensionPoints ?? []) {
      if (entry.point !== 'shop.products-toolbar') continue
      if (entry.permission && !(await hasPermission(user, entry.permission))) continue
      const Component = components[entry.id]
      if (Component) nodes.push(<Component key={entry.id} />)
    }
  }
  return nodes.length ? <>{nodes}</> : null
}

export default async function ShopProductsPage() {
  const user = await getSessionFromCookie()
  if (!user) return null
  const canAccess = await hasShopPermission(user, 'shop.products', { allowAccess: true })
  if (!canAccess) return <div className="alert alert-danger">You do not have permission to view Shop products.</div>

  const toolbarExtras = await resolveToolbarExtras(user)
  return <ProductsScreen toolbarExtras={toolbarExtras} />
}
