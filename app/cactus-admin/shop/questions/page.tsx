import { getSessionFromCookie } from '@/lib/auth/session'
import { hasShopPermission } from '@/modules/shop/lib/access'
import { getShopConfigCached } from '@/modules/shop/lib/config'
import { ProductQuestionsScreen } from '@/modules/shop/components/admin/ProductQuestionsScreen'
import { ShopSectionNav } from '@/modules/shop/components/admin/ShopSectionNav'
import { resolveCatalogueNavTabs } from '@/modules/shop/lib/admin-nav'

export const metadata = { title: 'Product questions — Admin' }

export default async function ShopQuestionsPage({ searchParams }: { searchParams: Promise<{ productId?: string }> }) {
  const user = await getSessionFromCookie()
  if (!user) return null
  const canAccess = await hasShopPermission(user, 'shop.products', { allowAccess: true })
  if (!canAccess) return <div className="alert alert-danger">You do not have permission to view the Shop catalogue.</div>

  const [navTabs, config, { productId }] = await Promise.all([
    resolveCatalogueNavTabs(user),
    getShopConfigCached(),
    searchParams,
  ])

  return (
    <div>
      <ShopSectionNav tabs={navTabs} active="questions" />
      {/* The page stays reachable with the feature switched off - questions
          already asked do not stop existing because the button came down - but it
          says so, since an empty queue and a queue nobody can add to look
          identical otherwise. */}
      {!config.productQuestionsEnabled && (
        <div className="alert alert-warning" style={{ marginBottom: '1rem' }}>
          Shoppers cannot ask questions at the moment. Switch &ldquo;Let shoppers ask a question&rdquo; back on under
          Shop settings &rarr; General &rarr; Product FAQs. Anything already asked is still below.
        </div>
      )}
      <ProductQuestionsScreen productId={productId} />
    </div>
  )
}
