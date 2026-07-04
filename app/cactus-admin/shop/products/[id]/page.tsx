import { getSessionFromCookie } from '@/lib/auth/session'
import { hasShopPermission } from '@/modules/shop/lib/access'
import { ProductEditor } from '@/modules/shop/components/admin/ProductEditor'

export const metadata = { title: 'Edit Product — Admin' }

export default async function ShopProductEditPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionFromCookie()
  if (!user) return null
  const canAccess = await hasShopPermission(user, 'shop.products')
  if (!canAccess) return <div className="alert alert-danger">You do not have permission to edit Shop products.</div>

  const { id } = await params
  return (
    <div>
      <div className="page-header"><h1 className="page-title">Edit product</h1></div>
      <ProductEditor productId={id} />
    </div>
  )
}
