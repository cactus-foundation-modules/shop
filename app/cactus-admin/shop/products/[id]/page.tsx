import { getSessionFromCookie } from '@/lib/auth/session'
import { hasPermission } from '@/lib/permissions/check'
import { hasShopPermission } from '@/modules/shop/lib/access'
import { ProductEditor, type ExtraTab } from '@/modules/shop/components/admin/ProductEditor'
import { getProductById } from '@/modules/shop/lib/db'
import { prisma } from '@/lib/db/prisma'
import { moduleExtensionPointComponents } from '@/lib/modules/extension-points'

export const metadata = { title: 'Edit Product — Admin' }

type ExtensionPointEntry = {
  point: string
  id: string
  permission?: string
  /** Tab name. Falls back to the entry id if a module has not declared one. */
  label?: string
  /** Where the tab sits among the editor's own. Unordered tabs go last. */
  order?: number
}

// Other modules (e.g. shop-variations, product-attributes-for-shop) hang a tab on
// the product editor via the `shop.product-editor-sections` point. Their panels
// are server components, rendered here and handed to the client shell, which owns
// the tab strip and the single Save button they register against.
async function resolveProductEditorTabs(user: Awaited<ReturnType<typeof getSessionFromCookie>>) {
  if (!user) return []
  const modules = await prisma.module.findMany({ where: { status: { in: ['active', 'update_available'] } }, select: { manifest: true } })
  const entries: ExtensionPointEntry[] = []
  for (const mod of modules) {
    const manifest = mod.manifest as { extensionPoints?: ExtensionPointEntry[] } | null
    if (!manifest?.extensionPoints) continue
    for (const entry of manifest.extensionPoints) {
      if (entry.point !== 'shop.product-editor-sections') continue
      if (!entry.permission || (await hasPermission(user, entry.permission))) entries.push(entry)
    }
  }
  return entries
}

/** "product-attributes-inline" reads better as "Product attributes" than as nothing. */
function fallbackLabel(id: string): string {
  const words = id.replace(/-inline$/, '').replace(/-/g, ' ').trim()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

export default async function ShopProductEditPage({ params, searchParams }: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ tab?: string }>
}) {
  const user = await getSessionFromCookie()
  if (!user) return null
  const canAccess = await hasShopPermission(user, 'shop.products')
  if (!canAccess) return <div className="alert alert-danger">You do not have permission to edit Shop products.</div>

  const { id } = await params
  const { tab } = await searchParams

  const product = id === 'new' ? null : await getProductById(id)
  // Variant children are real products with their own row, but they are managed
  // from their parent's Variations tab, never opened in their own right.
  if (product?.catalogueHidden) {
    return <div className="alert alert-danger">This is one variant of another product. Edit it from that product&rsquo;s Variations tab.</div>
  }

  // Only a saved product can carry variations or attributes; the tabs stay hidden
  // while creating.
  const entries = id === 'new' ? [] : await resolveProductEditorTabs(user)
  const components = moduleExtensionPointComponents['shop.product-editor-sections'] ?? {}

  const extraTabs: ExtraTab[] = entries.flatMap((entry) => {
    const Section = components[entry.id]
    if (!Section) return []
    return [{
      id: entry.id,
      label: entry.label ?? fallbackLabel(entry.id),
      order: entry.order ?? 999,
      node: <Section productId={id} />,
    }]
  })

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">{product?.name || 'Edit product'}</h1>
      </div>
      <ProductEditor productId={id} extraTabs={extraTabs} initialTab={tab} />
    </div>
  )
}
