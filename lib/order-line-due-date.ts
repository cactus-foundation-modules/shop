// `shop.order-line-due-date` - a module that promised an order line a delivery
// day says which day that is, so the orders list can show when the next thing is
// due at the customer's door before any parcel has been booked.
//
// Why a seam rather than a column: the promise is not shop's. A delivery service
// picked at the checkout is another module's snapshot, filed in the line's
// `line_meta.data` under that module's own key, and shop never reads a key of
// `data` (see LineMeta in lib/types.ts). So shop hands each line back to whoever
// wrote it and asks. That also makes it work on every order already placed: the
// module reads the state it has been writing all along, and nothing has to be
// backfilled.
//
// Shop stays generic throughout. It knows nothing about services, lead times or
// working days - only that a provider answered a line with a calendar day, which
// it checks is one and then compares with the courier's booked days.
//
// Server-only: the answer is for an admin list, and a provider may go back to its
// own tables. Contribute it with `serverOnly: true` on the manifest entry.
import { getInstalledManifests } from '@/lib/modules/live-status'
import { isDeliveryDate } from '@/modules/shop/lib/delivery-slot'
import type { LineMeta } from '@/modules/shop/lib/types'

export type OrderLineForDueDate = {
  itemId: string
  orderId: string
  lineMeta: LineMeta | null
  // Whether the money for the order has landed. A promise counted from dispatch
  // is not a date until then - nothing is dispatched unpaid - so a provider
  // that restates its wording on payment (shop.order-payment-state) will want
  // to answer an unpaid line with nothing at all.
  paid: boolean
}

// Item id -> 'YYYY-MM-DD'. A line the provider promised nothing for is simply
// left out.
export type OrderLineDueDateProvider = (
  lines: OrderLineForDueDate[],
) => Promise<Record<string, string>> | Record<string, string>

const POINT = 'shop.order-line-due-date'

type ExtensionPointEntry = { point: string; id: string }

/**
 * The day each line is due, by item id, from every installed provider. Where two
 * providers both answer a line the sooner day wins, since the question the list
 * is asking is when the next thing happens.
 *
 * An empty map on a shop with no provider, and no work done to get it. A
 * provider that throws is logged and skipped: a missing date on the orders list
 * is a shrug, a list that will not load is not.
 */
export async function resolveOrderLineDueDates(lines: OrderLineForDueDate[]): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  if (lines.length === 0) return out

  // Dynamic, and the SERVER map, for the reasons lib/card-media.ts gives: a
  // static edge to the registry closes an import cycle, and the public map is
  // where client code reads from.
  const { moduleServerExtensionPointComponents } = await import('@/lib/modules/extension-points.server')
  const providers = moduleServerExtensionPointComponents[POINT] ?? {}
  if (Object.keys(providers).length === 0) return out

  const modules = await getInstalledManifests()
  for (const mod of modules) {
    const manifest = mod.manifest as { extensionPoints?: ExtensionPointEntry[] } | null
    if (!manifest?.extensionPoints) continue
    for (const entry of manifest.extensionPoints) {
      if (entry.point !== POINT) continue
      const provider = providers[entry.id] as OrderLineDueDateProvider | undefined
      if (!provider) continue
      let answered: Record<string, string>
      try {
        answered = await provider(lines)
      } catch (error) {
        console.error(`[shop.order-line-due-date] provider "${entry.id}" failed`, error)
        continue
      }
      for (const [itemId, date] of Object.entries(answered)) {
        // Checked rather than trusted: the day is compared as text against the
        // courier's booked days, which only works while both are 'YYYY-MM-DD'.
        if (!isDeliveryDate(date)) continue
        const held = out.get(itemId)
        if (held === undefined || date < held) out.set(itemId, date)
      }
    }
  }
  return out
}

export type DueLine = {
  itemId: string
  // Units neither sent nor refunded: still to go out, so still owed on the
  // promise the line was sold with.
  outstanding: number
}

export type DueParcel = {
  // The courier's booked day, when one has been given.
  deliveryDate: string | null
  delivered: boolean
  itemIds: string[]
}

/**
 * The soonest day anything on one order is due at the door, or null.
 *
 * - A line with units still to go out is due on the day it was promised.
 * - A parcel on its way is due on the day the courier booked; one with no day
 *   booked yet is still due whenever its lines were promised.
 * - A delivered parcel is due nothing. It has arrived, and the question is when
 *   the NEXT van comes.
 *
 * A courier's day beats the promise for the goods in its parcel because it is
 * the later, better-informed answer. Every day is 'YYYY-MM-DD', so the text
 * comparison is the calendar one.
 */
export function nextDueDate(lines: DueLine[], parcels: DueParcel[], dueByItem: ReadonlyMap<string, string>): string | null {
  const days: string[] = []
  for (const line of lines) {
    const due = line.outstanding > 0 ? dueByItem.get(line.itemId) : undefined
    if (due) days.push(due)
  }
  for (const parcel of parcels) {
    if (parcel.delivered) continue
    if (parcel.deliveryDate) {
      days.push(parcel.deliveryDate)
      continue
    }
    for (const itemId of parcel.itemIds) {
      const due = dueByItem.get(itemId)
      if (due) days.push(due)
    }
  }
  return days.reduce<string | null>((soonest, day) => (soonest === null || day < soonest ? day : soonest), null)
}
