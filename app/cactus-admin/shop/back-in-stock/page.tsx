import { getSessionFromCookie } from '@/lib/auth/session'
import { hasShopPermission } from '@/modules/shop/lib/access'
import { BackInStockScreen } from '@/modules/shop/components/admin/BackInStockScreen'

export const metadata = { title: 'Back in Stock — Admin' }

export default async function ShopBackInStockPage({ searchParams }: { searchParams: Promise<{ productId?: string }> }) {
  const user = await getSessionFromCookie()
  if (!user) return null
  const canAccess = await hasShopPermission(user, 'shop.products', { allowAccess: true })
  if (!canAccess) return <div className="alert alert-danger">You do not have permission to view this.</div>

  const { productId } = await searchParams
  return <BackInStockScreen productId={productId} />
}
