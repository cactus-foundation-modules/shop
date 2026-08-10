import { getSessionFromCookie } from '@/lib/auth/session'
import { hasPermission } from '@/lib/permissions/check'
import { hasShopPermission } from '@/modules/shop/lib/access'
import { ProductsScreen } from '@/modules/shop/components/admin/ProductsScreen'
import { ShopSectionNav } from '@/modules/shop/components/admin/ShopSectionNav'
import { resolveCatalogueNavTabs } from '@/modules/shop/lib/admin-nav'
import { resolveExtensionTabs } from '@/lib/modules/extension-tabs'
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

// This page is the front of the Catalogue section: the products list itself, the
// tab strip that carries Categories and Collections, and the home for whatever a
// companion module publishes into `shop.products-tabs` (variations, attributes,
// add-ons, filters, reviews). A contributed tab is opened with ?tab=<id> so the
// strip can be plain links shared with the other pages in the section.
export default async function ShopProductsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const user = await getSessionFromCookie()
  if (!user) return null
  const canAccess = await hasShopPermission(user, 'shop.products', { allowAccess: true })
  if (!canAccess) return <div className="alert alert-danger">You do not have permission to view Shop products.</div>

  const { tab } = await searchParams
  const [navTabs, contributed, toolbarExtras] = await Promise.all([
    resolveCatalogueNavTabs(user),
    resolveExtensionTabs('shop.products-tabs', user),
    resolveToolbarExtras(user),
  ])

  // An unknown ?tab= (a stale link, a module since removed) falls back to the
  // products list rather than an empty page.
  const active = contributed.find((t) => t.id === tab) ?? null

  return (
    <div>
      <ShopSectionNav tabs={navTabs} active={active?.id ?? 'products'} />
      {active ? <active.Component /> : <ProductsScreen toolbarExtras={toolbarExtras} />}
    </div>
  )
}
