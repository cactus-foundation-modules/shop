import { headers } from 'next/headers'
import { getSessionFromCookie } from '@/lib/auth/session'
import { hasShopPermission } from '@/modules/shop/lib/access'
import { getCategoryById } from '@/modules/shop/lib/db'
import { StandaloneCategoryDescriptionEditor } from '@/modules/shop/components/admin/categories/StandaloneCategoryDescriptionEditor'
import { DESCRIPTION_BUILDER_CHROME_OFF_CSS } from '@/modules/shop/components/admin/description-builder/shared'

export const metadata = { title: 'Edit category description — Admin' }

// The full-screen category description builder, opened in its own tab from the
// categories screen. It lives under the admin path (so the session gate and
// rewrites apply) but DESCRIPTION_BUILDER_CHROME_OFF_CSS strips the admin shell,
// leaving nothing but the page builder.
export default async function ShopCategoryDescriptionPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionFromCookie()
  if (!user) return null
  if (!(await hasShopPermission(user, 'shop.products'))) {
    return <div className="alert alert-danger">You do not have permission to edit Shop categories.</div>
  }

  const { id } = await params
  const category = await getCategoryById(id)
  if (!category) return <div className="alert alert-danger">This category could not be found.</div>

  const adminPath = (await headers()).get('x-cactus-admin-path') ?? ''

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: DESCRIPTION_BUILDER_CHROME_OFF_CSS }} />
      <StandaloneCategoryDescriptionEditor
        categoryId={id}
        categoryName={category.name}
        backHref={`/${adminPath}/m/shop/categories`}
        initialData={category.descriptionPuck}
      />
    </>
  )
}
