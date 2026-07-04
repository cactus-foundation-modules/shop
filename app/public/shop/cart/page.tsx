import { CartPageClient } from '@/modules/shop/components/public/CartPageClient'
import { ShopUpsellProducts } from '@/modules/shop/components/puck/ShopUpsellProducts'

export const metadata = { title: 'Your cart' }

export default function ShopCartPage() {
  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '2rem 1.5rem', display: 'grid', gap: '2rem' }}>
      <h1 style={{ fontSize: '1.75rem', margin: 0 }}>Your cart</h1>
      <CartPageClient />
      <ShopUpsellProducts />
    </div>
  )
}
