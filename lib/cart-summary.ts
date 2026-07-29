// Cart-wide notes (spec: `shop.cart-summary`). A cart-line resolver speaks about
// one line; this point speaks about the WHOLE basket - "everything by Fri 4 Sep",
// "arrives in 2 deliveries" - which no per-line hook can say, because the answer
// only exists once every line is known.
//
// Shop stays generic in the usual way: it hands a provider the cart's products,
// quantities and raw meta, and gets back a short string it displays verbatim
// (currently in the cart's sticky checkout bar, beside the item count). It never
// composes or interprets the wording, so nothing about delivery, dates or any
// other module's subject matter lands in shop.
import type { ShpProduct } from '@/modules/shop/lib/types'
import { gatherCartExtensionPoint } from '@/modules/shop/lib/line-meta'

// One cart line as a provider sees it. `meta` is the shopper's raw per-line bag
// exactly as the client stored it (the chosen delivery service, say) - a
// provider that needs a value the shopper never set applies its own default,
// precisely as its line resolver already does.
export type CartSummaryLine = {
  product: ShpProduct
  quantity: number
  meta?: Record<string, unknown>
}

// `id` is the provider's own, so the cart can key the notes it renders; `text`
// is finished copy, shown as-is.
export type CartSummaryNote = { id: string; text: string }

export type CartSummaryProvider = (lines: CartSummaryLine[]) => Promise<CartSummaryNote | null> | CartSummaryNote | null

const POINT = 'shop.cart-summary'

// Every installed module's note, in manifest order. A provider that has nothing
// to say returns null and is simply absent. A provider that THROWS is skipped
// too: these notes are chrome, and a broken one must never take the cart's
// validate down with it - the shopper would lose their whole basket display over
// a decorative line.
export async function getCartSummaryNotes(lines: CartSummaryLine[]): Promise<CartSummaryNote[]> {
  if (lines.length === 0) return []
  const providers = await gatherCartExtensionPoint<CartSummaryProvider>(POINT)
  if (providers.length === 0) return []
  const notes: CartSummaryNote[] = []
  for (const provide of providers) {
    try {
      const note = await provide(lines)
      if (note?.text) notes.push(note)
    } catch {
      // Chrome only - skip this provider and carry on.
    }
  }
  return notes
}
