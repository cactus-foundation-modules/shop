import { NextResponse } from 'next/server'
import { requireShopUser } from '@/modules/shop/lib/access'
import { getShopConfig } from '@/modules/shop/lib/config'
import { courierForShipment } from '@/modules/shop/lib/courier-faqs'
import { countOpenParcelsByCourierRef } from '@/modules/shop/lib/db/shipments'

// PROTECTED - how many parcels are still on their way with each courier, for
// the Couriers screen to say before one is removed. Read-only.
//
// Answered as { counts: { [courierId]: number } }; a courier with nothing out
// is simply absent. Parcels whose carrier was typed in and matches no courier
// are not counted against anybody.

export async function GET() {
  const gate = await requireShopUser('shop.manage')
  if (gate.error) return gate.error

  const [config, groups] = await Promise.all([getShopConfig(), countOpenParcelsByCourierRef()])
  const counts: Record<string, number> = {}
  for (const group of groups) {
    const courier = courierForShipment(config, { courierId: group.courierId, carrier: group.carrier })
    if (courier) counts[courier.id] = (counts[courier.id] ?? 0) + group.count
  }
  return NextResponse.json({ counts })
}
