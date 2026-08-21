import { headers } from 'next/headers'
import { getSessionFromCookie } from '@/lib/auth/session'
import { hasShopPermission } from '@/modules/shop/lib/access'
import { getCollectionById } from '@/modules/shop/lib/db'
import { StandaloneCollectionDescriptionEditor } from '@/modules/shop/components/admin/collections/StandaloneCollectionDescriptionEditor'
import { DESCRIPTION_BUILDER_CHROME_OFF_CSS } from '@/modules/shop/components/admin/description-builder/shared'

export const metadata = { title: 'Edit collection description — Admin' }

// The full-screen collection description builder, opened in its own tab from the
// collections screen. It lives under the admin path (so the session gate and
// rewrites apply) but DESCRIPTION_BUILDER_CHROME_OFF_CSS strips the admin shell,
// leaving nothing but the page builder. Twin of the category one.
export default async function ShopCollectionDescriptionPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionFromCookie()
  if (!user) return null
  if (!(await hasShopPermission(user, 'shop.products'))) {
    return <div className="alert alert-danger">You do not have permission to edit Shop collections.</div>
  }

  const { id } = await params
  const collection = await getCollectionById(id)
  if (!collection) return <div className="alert alert-danger">This collection could not be found.</div>

  const adminPath = (await headers()).get('x-cactus-admin-path') ?? ''

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: DESCRIPTION_BUILDER_CHROME_OFF_CSS }} />
      <StandaloneCollectionDescriptionEditor
        collectionId={id}
        collectionName={collection.name}
        backHref={`/${adminPath}/m/shop/collections`}
        initialData={collection.descriptionPuck}
      />
    </>
  )
}
