import { getSessionFromCookie } from '@/lib/auth/session'
import { hasShopPermission } from '@/modules/shop/lib/access'
import { TaxShippingScreen } from '@/modules/shop/components/admin/TaxShippingScreen'

export const metadata = { title: 'Shop Tax & Shipping — Admin' }

export default async function ShopTaxShippingPage() {
  const user = await getSessionFromCookie()
  if (!user) return null
  const canAccess = await hasShopPermission(user, 'shop.manage', { allowAccess: true })
  if (!canAccess) return <div className="alert alert-danger">You do not have permission to view Shop tax and shipping settings.</div>
  return <TaxShippingScreen />
}
