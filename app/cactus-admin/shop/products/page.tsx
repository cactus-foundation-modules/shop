import { getSessionFromCookie } from '@/lib/auth/session'
import { hasPermission } from '@/lib/permissions/check'
import { hasShopPermission } from '@/modules/shop/lib/access'
import { ProductsScreen, type ProductsTab } from '@/modules/shop/components/admin/ProductsScreen'
import { prisma } from '@/lib/db/prisma'
import { INSTALLED_MODULE_WHERE } from '@/lib/modules/live-status'
import { moduleExtensionPointComponents } from '@/lib/modules/extension-points'

export const metadata = { title: 'Shop Products — Admin' }

type ExtensionPointEntry = { point: string; id: string; permission?: string; label?: string; order?: number }

// Other modules (e.g. google-sheet-products-for-shop) hang controls beside the
// Products header buttons via the `shop.products-toolbar` point. Their components
// are resolved here and handed to the client screen, permission-gated per entry.
// A plain shop with nothing contributing simply gets no extras.
async function resolveToolbarExtras(user: Awaited<ReturnType<typeof getSessionFromCookie>>) {
  if (!user) return null
  const components = moduleExtensionPointComponents['shop.products-toolbar'] ?? {}
  const modules = await prisma.module.findMany({ where: { ...INSTALLED_MODULE_WHERE }, select: { manifest: true } })
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

// A tab's manifest `label` is stripped by the install-time schema until the next
// deploy restores it (see product-editor-sections), so fall back to a tidy label
// derived from the entry id in the meantime.
function fallbackTabLabel(id: string): string {
  const words = id.replace(/-/g, ' ').trim()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

// Whole-page tabs other modules hang beside the Products list through the
// `shop.products-tabs` point (e.g. shop-variations' cross-product Variations
// browser). Resolved here because only a server context can read the manifests
// and check permissions; each tab's panel is rendered and handed to the client
// screen, which owns the tab strip and only mounts the panel while it is active.
async function resolveProductsTabs(user: Awaited<ReturnType<typeof getSessionFromCookie>>): Promise<ProductsTab[]> {
  if (!user) return []
  const components = moduleExtensionPointComponents['shop.products-tabs'] ?? {}
  const modules = await prisma.module.findMany({ where: { ...INSTALLED_MODULE_WHERE }, select: { manifest: true } })
  const tabs: ProductsTab[] = []
  for (const mod of modules) {
    const manifest = mod.manifest as { extensionPoints?: ExtensionPointEntry[] } | null
    for (const entry of manifest?.extensionPoints ?? []) {
      if (entry.point !== 'shop.products-tabs') continue
      if (entry.permission && !(await hasPermission(user, entry.permission))) continue
      const Component = components[entry.id]
      if (Component) tabs.push({ id: entry.id, label: entry.label ?? fallbackTabLabel(entry.id), order: entry.order ?? 999, node: <Component /> })
    }
  }
  return tabs
}

export default async function ShopProductsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const user = await getSessionFromCookie()
  if (!user) return null
  const canAccess = await hasShopPermission(user, 'shop.products', { allowAccess: true })
  if (!canAccess) return <div className="alert alert-danger">You do not have permission to view Shop products.</div>

  const { tab } = await searchParams
  const [toolbarExtras, productsTabs] = await Promise.all([resolveToolbarExtras(user), resolveProductsTabs(user)])
  return <ProductsScreen toolbarExtras={toolbarExtras} productsTabs={productsTabs} initialTab={tab} />
}
