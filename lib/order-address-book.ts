import { rememberAddressForMember } from '@/modules/shop/lib/db/addresses'
import type { ShpAddress } from '@/modules/shop/lib/types'

// Files a completed order's addresses into the shopper's address book, so the
// next checkout can offer them back rather than asking them to type them again.
// Only signed-in shoppers have a book to file into; a guest order is simply
// nothing to do here.
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
  // Only ever set when the shopper said the invoice goes somewhere else - see
  // the checkout's payment step, which sends one only while that box is ticked.
  billingAddress?: ShpAddress | null
}): Promise<void> {
  const memberId = order.memberId
  if (!memberId) return
  await file(order.id, memberId, order.shippingAddress, {})
  // The billing address goes in the same book, so a shopper who invoices to
  // head office types that address once rather than once per order. Labelled,
  // because it arrives with no name on it - the billing form asks for none, the
  // invoice being made out to whoever placed the order - and an unlabelled,
  // nameless entry reads as "Address" in the account list. Never the default:
  // the default is what the next checkout offers to deliver to.
  //
  // Same door as the delivery address is not a second address: the dedupe in
  // rememberAddressForMember settles that, so nothing here has to compare them.
  if (order.billingAddress) {
    await file(order.id, memberId, order.billingAddress, { label: 'Billing address', canBecomeDefault: false })
  }
}

async function file(
  orderId: string,
  memberId: string,
  address: ShpAddress,
  opts: { label?: string | null; canBecomeDefault?: boolean },
): Promise<void> {
  if (!address?.line1?.trim()) return
  try {
    await rememberAddressForMember(memberId, address, opts)
  } catch (error) {
    console.error(`[shop.order-address-book] could not save an address from order ${orderId}`, error)
  }
}
