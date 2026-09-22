import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireShopUser } from '@/modules/shop/lib/access'
import { updateShippingZone, deleteShippingZone, listAllShippingRatesForZone } from '@/modules/shop/lib/db'
import { ZonePostcodeList } from '@/modules/shop/lib/zone-postcode-list'

const Body = z.object({
  name: z.string().min(1, 'Give the zone a name.').optional(),
  postcodes: ZonePostcodeList.optional(),
  excludedPostcodes: ZonePostcodeList.optional(),
})

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireShopUser('shop.manage', { allowAccess: true })
  if (gate.error) return gate.error
  const { id } = await params
  const rates = await listAllShippingRatesForZone(id)
  return NextResponse.json({ rates })
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireShopUser('shop.manage')
  if (gate.error) return gate.error
  const { id } = await params
  const parsed = Body.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid zone' }, { status: 400 })
  await updateShippingZone(id, parsed.data)
  return NextResponse.json({ success: true })
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireShopUser('shop.manage')
  if (gate.error) return gate.error
  const { id } = await params
  await deleteShippingZone(id)
  return NextResponse.json({ success: true })
}
