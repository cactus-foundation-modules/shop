import { headers } from 'next/headers'
import { getSessionFromCookie } from '@/lib/auth/session'
import { hasShopPermission } from '@/modules/shop/lib/access'
import { getProductById } from '@/modules/shop/lib/db'
import { StandaloneDescriptionEditor } from '@/modules/shop/components/admin/product-editor/StandaloneDescriptionEditor'
import type { PuckData } from '@/modules/shop/lib/types'

export const metadata = { title: 'Edit description — Admin' }

// The full-screen description builder, opened in its own tab from the product
// editor. It lives under the admin path (so the session gate and rewrites apply)
// but the CSS below strips the admin shell, leaving nothing but the page builder.
const CHROME_OFF_CSS = `
.admin-shell{height:100vh;overflow:hidden;--radius-lg:var(--admin-radius-lg)}
.admin-sidebar,.admin-mobile-topbar{display:none!important}
.admin-content{padding:0!important;overflow:hidden;display:flex;flex-direction:column;min-height:0}
.spe-desc-standalone{display:flex;flex-direction:column;height:100vh;min-height:0;background:var(--color-bg)}
.spe-desc-standalone-bar{display:flex;align-items:center;gap:var(--space-4);padding:var(--space-3) var(--space-4);border-bottom:1px solid var(--color-border);background:var(--color-surface);flex-shrink:0}
.spe-desc-standalone-title{display:flex;flex-direction:column;line-height:1.2;min-width:0}
.spe-desc-standalone-title strong{color:var(--color-text);font-size:0.95rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.spe-desc-standalone-eyebrow{color:var(--color-text-muted);font-size:0.7rem;text-transform:uppercase;letter-spacing:0.04em}
.spe-desc-standalone-status{margin-left:auto;color:var(--color-text-muted);font-size:0.85rem;text-align:right}
.spe-desc-standalone-status--error{color:var(--color-danger)}
.spe-desc-standalone-canvas{flex:1;min-height:0;overflow:hidden;position:relative}
.spe-desc-standalone-canvas .Puck{height:100%}
`

export default async function ShopProductDescriptionPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionFromCookie()
  if (!user) return null
  if (!(await hasShopPermission(user, 'shop.products'))) {
    return <div className="alert alert-danger">You do not have permission to edit Shop products.</div>
  }

  const { id } = await params
  const product = id === 'new' ? null : await getProductById(id)
  if (!product) return <div className="alert alert-danger">This product could not be found.</div>
  // Variant children are managed from their parent's Variations tab, never on their own.
  if (product.catalogueHidden) {
    return <div className="alert alert-danger">This is one variant of another product. Edit it from that product&rsquo;s Variations tab.</div>
  }

  const adminPath = (await headers()).get('x-cactus-admin-path') ?? ''
  const backHref = `/${adminPath}/m/shop/products/${id}?tab=details`

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: CHROME_OFF_CSS }} />
      <StandaloneDescriptionEditor
        productId={id}
        productName={product.name || 'Untitled product'}
        backHref={backHref}
        initialData={(product.descriptionPuck as PuckData | null) ?? null}
      />
    </>
  )
}
