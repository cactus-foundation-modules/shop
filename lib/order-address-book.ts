import { rememberAddressForMember } from '@/modules/shop/lib/db/addresses'
import type { ShpAddress } from '@/modules/shop/lib/types'

// Files a completed order's delivery address into the shopper's address book,
// so the next checkout can offer it back rather than asking them to type it
// again. Only signed-in shoppers have a book to file into; a guest order is
// simply nothing to do here.
//
// Called at the point the order stops being a half-finished basket - payment
// taken, or a pay-later method accepted and parked for the shop to confirm.
// Not at order creation: an abandoned checkout would otherwise leave an address
// in a book the shopper never asked to fill.
//
// Never throws. A shop that cannot write an address book entry has still taken
// a real order, and failing the request that reports that would turn a cosmetic
// problem into a lost sale.
export async function rememberOrderAddress(order: {
  id: string
  memberId: string | null
  shippingAddress: ShpAddress
}): Promise<void> {
  if (!order.memberId) return
  if (!order.shippingAddress?.line1?.trim()) return
  try {
    await rememberAddressForMember(order.memberId, order.shippingAddress)
  } catch (error) {
    console.error(`[shop.order-address-book] could not save the address from order ${order.id}`, error)
  }
}
