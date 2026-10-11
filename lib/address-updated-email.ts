import { escapeHtml } from '@/lib/email/blocks'
import { getShopConfigCached } from '@/modules/shop/lib/config'
import { deliveryInstructionsLabel } from '@/modules/shop/lib/delivery-instructions'
import { notifyOrderCustomer } from '@/modules/shop/lib/order-notify'
import type { ShpAddress, ShpOrder } from '@/modules/shop/lib/types'

// "We have changed where your order is going."
//
// Sent only when staff tick the box while amending the delivery address or
// delivery instructions on the order screen. Never automatic: plenty of corrections are a typo fixed after a
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

/** The instructions as an escaped block. Raw HTML to the template, like the
 *  address, so a customer's "<b>" is shown rather than obeyed. */
export function instructionsHtml(instructions: string): string {
  return `<p>${instructions.split(/\r?\n/).map((line) => escapeHtml(line)).join('<br />')}</p>`
}

/** What changed, so the one template can say the right thing: the address, the
 *  instructions, or both. Flat flags because core's {{#if}} neither nests nor
 *  has an else. A change to nothing at all sends nothing. */
export type DeliveryDetailsChange = {
  address?: ShpAddress
  /** The new instructions; an empty string means they were cleared. */
  instructions?: string
}

export async function sendAddressUpdatedEmail(order: ShpOrder, change: DeliveryDetailsChange): Promise<void> {
  const config = await getShopConfigCached()
  const addressChanged = change.address !== undefined
  const instructionsChanged = change.instructions !== undefined
  if (!addressChanged && !instructionsChanged) return
  const instructions = change.instructions?.trim() ?? ''
  await notifyOrderCustomer('ADDRESS_UPDATED', order, {
    orderNumber: order.orderNumber,
    customerName: order.customerName,
    newAddress: change.address ? addressHtml(change.address) : '',
    newDeliveryInstructions: instructions ? instructionsHtml(instructions) : '',
    instructionsLabel: deliveryInstructionsLabel(config),
    hasAddressChange: addressChanged ? 'true' : 'false',
    hasInstructionsChange: instructionsChanged ? 'true' : 'false',
    hasNewInstructions: instructionsChanged && instructions ? 'true' : 'false',
    hasInstructionsRemoved: instructionsChanged && !instructions ? 'true' : 'false',
    hasBothChanges: addressChanged && instructionsChanged ? 'true' : 'false',
    shopName: config.shopTitle || 'Shop',
  })
}
