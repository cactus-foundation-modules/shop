import type { Data } from '@puckeditor/core'
import { getModuleLayoutPuckRscConfig } from '@/lib/puck/config.rsc'
import { resolveThemeLayout } from '@/lib/layout/resolveThemeLayout'
import { OrderConfirmationClient } from '@/modules/shop/components/public/OrderConfirmationClient'
import { CactusRender } from '@/lib/puck/CactusRender'

export const metadata = { title: 'Order confirmed' }

// Deliberately NOT behind the shop gate: this is the receipt for an order that
// has already been paid for, and it stays readable while the shop is closed
// (see getShopGate in lib/access.ts). The order status route behind it is left
// open for the same reason.
export default async function ShopCheckoutConfirmationPage() {
  const layout = await resolveThemeLayout('shopConfirmation', { moduleName: 'shop' })

  return (
    // Wider than the other shop pages (640) because the confirmation now shows
    // a receipt with delivery, method and payment side by side. The block sets
    // its own 720 ceiling; this only has to stop clamping it below that.
    <div style={{ maxWidth: 780, margin: '0 auto', padding: '2rem 1.5rem' }}>
      {layout?.builderData ? (
        <CactusRender config={getModuleLayoutPuckRscConfig('shopConfirmation') as any} data={layout.builderData as Data} />
      ) : (
        // No published Confirmation layout - unpublished, deleted, or never
        // seeded. The shopper has just paid, and a blank page is the worst
        // possible answer to "did that work?", so this falls back to the block
        // the simple starter holds, the same way the cart and checkout pages
        // fall back to theirs.
        <OrderConfirmationClient />
      )}
    </div>
  )
}
