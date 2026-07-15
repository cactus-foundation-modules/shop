import { getSessionFromCookie } from '@/lib/auth/session'
import { hasPermission } from '@/lib/permissions/check'
import { hasShopPermission } from '@/modules/shop/lib/access'
import { ProductEditor } from '@/modules/shop/components/admin/ProductEditor'
import { prisma } from '@/lib/db/prisma'
import { moduleExtensionPointComponents } from '@/lib/modules/extension-points'

export const metadata = { title: 'Edit Product — Admin' }

type ExtensionPointEntry = { point: string; id: string; permission?: string }

// Other modules (e.g. shop-variations) can hang extra sections under the product
// editor via the `shop.product-editor-sections` point - mirrors the
// shop.order-messages slot. Hidden entirely when nothing contributes.
async function resolveProductEditorSections(user: Awaited<ReturnType<typeof getSessionFromCookie>>) {
  if (!user) return []
  const modules = await prisma.module.findMany({ where: { status: { in: ['active', 'update_available'] } }, select: { manifest: true } })
  const ids: string[] = []
  for (const mod of modules) {
    const manifest = mod.manifest as { extensionPoints?: ExtensionPointEntry[] } | null
    if (!manifest?.extensionPoints) continue
    for (const entry of manifest.extensionPoints) {
      if (entry.point !== 'shop.product-editor-sections') continue
      if (!entry.permission || (await hasPermission(user, entry.permission))) ids.push(entry.id)
    }
  }
  return ids
}

export default async function ShopProductEditPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionFromCookie()
  if (!user) return null
  const canAccess = await hasShopPermission(user, 'shop.products')
  if (!canAccess) return <div className="alert alert-danger">You do not have permission to edit Shop products.</div>

  const { id } = await params
  // Only a saved product can carry variations; the slot stays hidden while creating.
  const sectionIds = id === 'new' ? [] : await resolveProductEditorSections(user)
  const sectionComponents = moduleExtensionPointComponents['shop.product-editor-sections'] ?? {}

  return (
    <div>
      <div className="page-header"><h1 className="page-title">Edit product</h1></div>
      <ProductEditor productId={id} />
      {sectionIds.map((sid) => {
        const Section = sectionComponents[sid]
        return Section ? <Section key={sid} productId={id} /> : null
      })}
    </div>
  )
}
