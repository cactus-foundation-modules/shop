import { headers } from 'next/headers'
import { getSessionFromCookie } from '@/lib/auth/session'
import { hasShopPermission } from '@/modules/shop/lib/access'
import { getSupplierById } from '@/modules/shop/lib/db'
import { StandaloneSupplierDescriptionEditor } from '@/modules/shop/components/admin/suppliers/StandaloneSupplierDescriptionEditor'
import { DESCRIPTION_BUILDER_CHROME_OFF_CSS } from '@/modules/shop/components/admin/description-builder/shared'

export const metadata = { title: 'Edit supplier write-up — Admin' }

// The full-screen supplier write-up builder, opened in its own tab from the
// suppliers screen. It lives under the admin path (so the session gate and
// rewrites apply) but DESCRIPTION_BUILDER_CHROME_OFF_CSS strips the admin shell,
// leaving nothing but the page builder. Twin of the collection one.
export default async function ShopSupplierDescriptionPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionFromCookie()
  if (!user) return null
  if (!(await hasShopPermission(user, 'shop.products'))) {
    return <div className="alert alert-danger">You do not have permission to edit Shop suppliers.</div>
  }

  const { id } = await params
  const supplier = await getSupplierById(id)
  if (!supplier) return <div className="alert alert-danger">This supplier could not be found.</div>

  const adminPath = (await headers()).get('x-cactus-admin-path') ?? ''

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: DESCRIPTION_BUILDER_CHROME_OFF_CSS }} />
      <StandaloneSupplierDescriptionEditor
        supplierId={id}
        supplierName={supplier.name}
        backHref={`/${adminPath}/m/shop/suppliers`}
        initialData={supplier.descriptionPuck}
      />
    </>
  )
}
