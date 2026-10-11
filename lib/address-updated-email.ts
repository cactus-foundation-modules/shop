import { escapeHtml } from '@/lib/email/blocks'
import { getShopConfigCached } from '@/modules/shop/lib/config'
import { notifyOrderCustomer } from '@/modules/shop/lib/order-notify'
import type { ShpAddress, ShpOrder } from '@/modules/shop/lib/types'

// "We have changed where your order is going."
//
// Sent only when staff tick the box while amending the delivery address on the
// order screen. Never automatic: plenty of corrections are a typo fixed after a
// phone call, and the customer was on the phone.

/** The address as an escaped block, one line per part. Raw HTML to the
 *  template, so every piece goes through escapeHtml here. */
export function addressHtml(address: ShpAddress): string {
  const lines = [
    [address.firstName, address.lastName].filter(Boolean).join(' '),
    address.company,
    address.line1,
    address.line2,
    address.city,
    address.county,
    address.postcode,
    address.country,
  ].filter((line): line is string => Boolean(line && line.trim()))
  return `<p>${lines.map((line) => escapeHtml(line)).join('<br />')}</p>`
}

export async function sendAddressUpdatedEmail(order: ShpOrder, address: ShpAddress): Promise<void> {
  const config = await getShopConfigCached()
  await notifyOrderCustomer('ADDRESS_UPDATED', order, {
    orderNumber: order.orderNumber,
    customerName: order.customerName,
    newAddress: addressHtml(address),
    shopName: config.shopTitle || 'Shop',
  })
}
