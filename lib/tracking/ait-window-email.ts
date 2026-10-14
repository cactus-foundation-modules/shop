import { isDeliveryDate, isSlotTime, slotMinutes } from '@/modules/shop/lib/delivery-slot'
import { normalisePostcode } from '@/modules/shop/lib/order-lookup'

// AIT Home Delivery's "time window" email, read.
//
// The one message of theirs that carries the real window. Their tracking page
// shows a holding window from the moment a day is booked; the evening before,
// they fix the real one and email it to whoever booked the delivery - the
// shop, not the customer:
//
//   Your DESKWELL LTD (PRO-FORMA) delivery on 14/10/2026 is expected between
//   08:06-10:06
//   ...
//   Please ensure that someone will be available to sign for your delivery at
//   this address 1-7 Whittington Avenue , 1 Whittington Avenue , London ,
//   EC3V 1LP
//
// It quotes no tracking code (the links in it are their mail provider's
// redirects) and no order number of ours, so the parcel is found by the
// delivery address's postcode and the day, in lib/ait-window-inbound.ts.
//
// Their "is booked for: 14/10/2026" email, sent when the day is booked, has no
// time in it and no address, and is not this.
//
// Pure: text in, values out.

/** Where their email comes from. Their own domains only - a colleague
 *  forwarding one is not AIT telling us. */
const AIT_MAIL_DOMAINS: readonly string[] = ['aithomedelivery.com', 'aithomedelivery.co.uk', 'aitworldwide.com', 'aithd.com']

/** Whether the sender is AIT itself. */
export function isAitSender(fromAddress: string | null | undefined): boolean {
  const domain = (fromAddress ?? '').trim().toLowerCase().split('@')[1] ?? ''
  return AIT_MAIL_DOMAINS.some((d) => domain === d || domain.endsWith(`.${d}`))
}

export type AitWindowEmail = {
  /** 'YYYY-MM-DD'. */
  date: string
  /** 'HH:MM', their wall clock - the site's, for a UK delivery. */
  slotStart: string
  slotEnd: string
  /** The delivery address as they print it, for the postcode check. Empty
   *  when the email leaves it out. */
  address: string
}

const WINDOW = /delivery on (\d{1,2})[/.](\d{1,2})[/.](\d{4}) is expected between (\d{1,2}):(\d{2})\s*(?:-|–|to)\s*(\d{1,2}):(\d{2})/i
const ADDRESS = /at this address\s*:?\s*(.{1,300}?)(?:\s+Please\b|\s+-{5,}|$)/i

const two = (n: string) => n.padStart(2, '0')

/** The day, window and address in one of their window emails, or null for any
 *  other email - theirs included. */
export function readAitWindowEmail(bodyText: string): AitWindowEmail | null {
  const text = bodyText.replace(/\s+/g, ' ')
  const m = WINDOW.exec(text)
  if (!m) return null
  const date = `${m[3]}-${two(m[2]!)}-${two(m[1]!)}`
  const slotStart = `${two(m[4]!)}:${m[5]}`
  const slotEnd = `${two(m[6]!)}:${m[7]}`
  if (!isDeliveryDate(date) || !isSlotTime(slotStart) || !isSlotTime(slotEnd)) return null
  if (slotMinutes(slotStart) >= slotMinutes(slotEnd)) return null
  const address = ADDRESS.exec(text.slice(m.index + m[0].length))?.[1]?.trim() ?? ''
  return { date, slotStart, slotEnd, address }
}

/**
 * Whether the address they printed ends in this postcode. Compared with every
 * space and comma gone, as the order lookup compares postcodes, and only at
 * the END of the address, where they print it - "E1 1AA" is otherwise a
 * substring of more than one address.
 */
export function addressEndsWithPostcode(address: string, postcode: string | null | undefined): boolean {
  const wanted = normalisePostcode(postcode)
  if (wanted.length < 3) return false
  return normalisePostcode(address).endsWith(wanted)
}
