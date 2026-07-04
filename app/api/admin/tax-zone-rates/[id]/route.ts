import { NextResponse } from 'next/server'
import { requireShopUser } from '@/modules/shop/lib/access'
import { deleteTaxZoneRate } from '@/modules/shop/lib/db'

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireShopUser('shop.manage')
  if (gate.error) return gate.error
  const { id } = await params
  await deleteTaxZoneRate(id)
  return NextResponse.json({ success: true })
}
