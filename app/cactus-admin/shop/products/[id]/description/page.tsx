import { headers } from 'next/headers'
import { getSessionFromCookie } from '@/lib/auth/session'
import { hasShopPermission } from '@/modules/shop/lib/access'
import { getProductById } from '@/modules/shop/lib/db'
import { StandaloneDescriptionEditor } from '@/modules/shop/components/admin/product-editor/StandaloneDescriptionEditor'
import { DESCRIPTION_BUILDER_CHROME_OFF_CSS } from '@/modules/shop/components/admin/description-builder/shared'
import type { PuckData } from '@/modules/shop/lib/types'

export const metadata = { title: 'Edit description — Admin' }

// The full-screen description builder, opened in its own tab from the product
// editor. It lives under the admin path (so the session gate and rewrites apply)
// but DESCRIPTION_BUILDER_CHROME_OFF_CSS strips the admin shell, leaving nothing
// but the page builder.

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
      <style dangerouslySetInnerHTML={{ __html: DESCRIPTION_BUILDER_CHROME_OFF_CSS }} />
      <StandaloneDescriptionEditor
        productId={id}
        productName={product.name || 'Untitled product'}
        backHref={backHref}
        initialData={(product.descriptionPuck as PuckData | null) ?? null}
      />
    </>
  )
}
