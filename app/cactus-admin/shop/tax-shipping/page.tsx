import { getSessionFromCookie } from '@/lib/auth/session'
import { hasPermission } from '@/lib/permissions/check'
import { hasShopPermission } from '@/modules/shop/lib/access'
import { TaxShippingScreen, type TaxShippingTab } from '@/modules/shop/components/admin/TaxShippingScreen'
import { ShopSectionNav } from '@/modules/shop/components/admin/ShopSectionNav'
import { resolveSalesNavTabs } from '@/modules/shop/lib/admin-nav'
import { prisma } from '@/lib/db/prisma'
import { INSTALLED_MODULE_WHERE } from '@/lib/modules/live-status'
import { moduleExtensionPointComponents } from '@/lib/modules/extension-points'

export const metadata = { title: 'Shop Tax & Shipping — Admin' }

type ExtensionPointEntry = { point: string; id: string; permission?: string; label?: string; order?: number }

// A tab's manifest `label` is stripped by the install-time schema until the next
// deploy restores it (see product-editor-sections), so fall back to a tidy label
// derived from the entry id in the meantime.
function fallbackTabLabel(id: string): string {
  const words = id.replace(/-/g, ' ').trim()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

// Whole-page tabs other modules hang beside tax and shipping through the
// `shop.tax-shipping-tabs` point (e.g. advanced-shipping-for-shop's delivery
// rules, service tiers, holidays and settings). Resolved here because only a
// server context can read the manifests and check permissions; each tab's panel
// is rendered and handed to the client screen, which owns the tab strip and only
// mounts the panel while it is active.
async function resolveTaxShippingTabs(user: Awaited<ReturnType<typeof getSessionFromCookie>>): Promise<TaxShippingTab[]> {
  if (!user) return []
  const components = moduleExtensionPointComponents['shop.tax-shipping-tabs'] ?? {}
  const modules = await prisma.module.findMany({ where: { ...INSTALLED_MODULE_WHERE }, select: { manifest: true } })
  const tabs: TaxShippingTab[] = []
  for (const mod of modules) {
    const manifest = mod.manifest as { extensionPoints?: ExtensionPointEntry[] } | null
    for (const entry of manifest?.extensionPoints ?? []) {
      if (entry.point !== 'shop.tax-shipping-tabs') continue
      if (entry.permission && !(await hasPermission(user, entry.permission))) continue
      const Component = components[entry.id]
      if (Component) tabs.push({ id: entry.id, label: entry.label ?? fallbackTabLabel(entry.id), order: entry.order ?? 999, node: <Component /> })
    }
  }
  return tabs
}

export default async function ShopTaxShippingPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const user = await getSessionFromCookie()
  if (!user) return null
  const canAccess = await hasShopPermission(user, 'shop.manage', { allowAccess: true })
  if (!canAccess) return <div className="alert alert-danger">You do not have permission to view Shop tax and shipping settings.</div>

  const { tab } = await searchParams
  const [extraTabs, navTabs] = await Promise.all([resolveTaxShippingTabs(user), resolveSalesNavTabs(user)])
  return (
    <div>
      <ShopSectionNav tabs={navTabs} active="tax-shipping" />
      <TaxShippingScreen extraTabs={extraTabs} initialTab={tab} />
    </div>
  )
}
