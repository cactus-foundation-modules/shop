import type { ShpDigitalDownload, ShpOrder, ShpOrderItem, ShpPaymentStatus } from '@/modules/shop/lib/types'

// Whether a download link may hand its file over right now, and what to say to
// the person holding it when it may not.
//
// One rule, read by two callers: the friendly page the emailed link opens, and
// the route behind its button that actually streams the bytes. Two copies of a
// rule that decides whether somebody gets a paid-for file would drift, and the
// day they did the page would promise a file the route then refused - or, the
// other way round, the route would hand over a file the page said was gone.
//
// A token is minted the moment an order is paid for, and it used to be the only
// thing ever checked: valid, not expired, not over the limit. So a refund taken
// back through the admin left the link working exactly as before, and the file
// went on being downloadable by anybody with the email for as long as the link
// lived. What the customer bought is the ORDER LINE, not the link, and the link
// is now worth only what the line is still worth.

export type DownloadRefusal = { status: number; message: string }

/** Said by the pre-check below and again by the route when the atomic slot
 *  reservation loses a race, so the two read the same. */
export const DOWNLOAD_LIMIT_REACHED = 'This download link has reached its download limit.'

/** The payment states in which the goods are paid for. PARTIALLY_REFUNDED is
 *  money handed back on SOME of an order; whether this line was part of it is
 *  answered by the line's own refunded quantity, not by the order. */
const PAID_STATES: ReadonlySet<ShpPaymentStatus> = new Set<ShpPaymentStatus>(['PAID', 'PARTIALLY_REFUNDED'])

export function downloadRefusal(input: {
  download: Pick<ShpDigitalDownload, 'expiresAt' | 'downloadCount'>
  order: Pick<ShpOrder, 'status' | 'paymentStatus'> | null
  item: Pick<ShpOrderItem, 'quantity' | 'refundedQty'> | null
  /** The product's own limit, null for as many as they like. */
  downloadLimit: number | null
  now?: Date
}): DownloadRefusal | null {
  const { download, order, item, downloadLimit } = input
  const now = input.now ?? new Date()

  // Both rows cascade away with the order, so a missing one means the link is
  // pointing at nothing - the same answer as a token nobody recognises.
  if (!order || !item) return { status: 404, message: 'This download link is not valid.' }

  if (download.expiresAt && download.expiresAt < now) {
    return { status: 410, message: 'This download link has expired.' }
  }

  // Refunded first, wherever the refund shows: on the line itself (a refund
  // raised from the order screen), or only on the order as a whole (a refund
  // taken straight from the card provider's own dashboard, which knows the
  // amount but not the line). A line refunded down to nothing is no longer
  // bought, whatever the rest of the order says.
  if (
    order.status === 'REFUNDED'
    || order.paymentStatus === 'REFUNDED'
    || item.refundedQty >= item.quantity
  ) {
    return { status: 410, message: 'This download is no longer available, because the order was refunded.' }
  }

  if (order.status === 'CANCELLED') {
    return { status: 410, message: 'This download is no longer available, because the order was cancelled.' }
  }

  // A payment that was later reversed - a chargeback, or a transfer marked paid
  // by mistake and put back - leaves the order unpaid with its link still
  // standing. Not "gone": the money may yet arrive, and the link will work again
  // the moment it does.
  if (!PAID_STATES.has(order.paymentStatus)) {
    return { status: 403, message: 'This download will be available once payment for the order has cleared.' }
  }

  if (downloadLimit != null && download.downloadCount >= downloadLimit) {
    return { status: 410, message: DOWNLOAD_LIMIT_REACHED }
  }

  return null
}
