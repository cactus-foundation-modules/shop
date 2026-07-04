import { NextResponse } from 'next/server'
import { requireShopUser } from '@/modules/shop/lib/access'
import { listOrdersByEmail } from '@/modules/shop/lib/db/orders'
import { listSavedAddresses } from '@/modules/shop/lib/db/addresses'

// [id] is the customer's email, URL-encoded - there's no shp_customers table.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireShopUser('shop.customers', { allowAccess: true })
  if (gate.error) return gate.error

  const { id } = await params
  const email = decodeURIComponent(id)
  const orders = await listOrdersByEmail(email)
  if (orders.length === 0) return NextResponse.json({ error: 'Customer not found' }, { status: 404 })

  const memberId = orders.find((o) => o.memberId)?.memberId ?? null
  const addresses = memberId ? await listSavedAddresses(memberId) : []

  return NextResponse.json({ email, name: orders[0]!.customerName, memberId, orders, addresses })
}
