// `shop.order-delivery-changed` - a module gets told that somebody changed where
// an order is going, or what the driver has been told about getting there.
//
// The reason this seam exists is the same as `shop.order-paid`'s: a drop-ship
// purchase order is raised from the customer's order and carries its own COPY of
// the delivery address, phone number and instructions. Staff correcting them on
// the order after the copy was taken is routine, and the supplier should be sent
// the corrected version. Shop knows the details changed and nothing else does;
// the module holding the copy knows about purchase orders and shop knows nothing
// about those. So shop announces, generically, and whoever is listening listens.
//
// OBSERVERS, not contributors. Nothing an observer returns is stored, and one
// having a bad day cannot undo the save - by the time this runs the new details
// are already on the order.
//
// Fired from the admin order PATCH route, only for a change that actually
// altered something (saving the same address twice announces nothing). The phone
// number lives on the delivery address, so a phone-only edit is an address
// change. An observer must be safe to run twice, and a hook is not a guarantee.
import { gatherCartExtensionPoint } from '@/modules/shop/lib/line-meta'

export type OrderDeliveryChangedEvent = {
  orderId: string
  orderNumber: string
  /** The delivery address, including the phone number on it, changed. */
  addressChanged: boolean
  /** The delivery instructions were added, edited or cleared. */
  instructionsChanged: boolean
}

export type OrderDeliveryChangedObserver = (event: OrderDeliveryChangedEvent) => Promise<void> | void

const POINT = 'shop.order-delivery-changed'

/**
 * Tell every registered observer that an order's delivery details changed.
 *
 * Never throws. Never rejects. An observer that throws is logged and the next
 * one still runs, because "the purchasing module is broken" must not read to the
 * person correcting the address as "that did not save".
 */
export async function notifyOrderDeliveryChanged(event: OrderDeliveryChangedEvent): Promise<void> {
  if (!event.addressChanged && !event.instructionsChanged) return
  try {
    const observers = await gatherCartExtensionPoint<OrderDeliveryChangedObserver>(POINT)
    for (const observe of observers) {
      try {
        await observe(event)
      } catch (err) {
        console.error(`[${POINT}] observer failed for order ${event.orderNumber}`, err)
      }
    }
  } catch (err) {
    console.error(`[${POINT}] observers could not be gathered for order ${event.orderNumber}`, err)
  }
}
