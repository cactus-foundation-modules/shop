import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireShopUser } from '@/modules/shop/lib/access'
import { updateShippingZone, deleteShippingZone, listAllShippingRatesForZone } from '@/modules/shop/lib/db'

const Body = z.object({ name: z.string().min(1).optional(), postcodes: z.array(z.string()).optional() })

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
  if (!parsed.success) return NextResponse.json({ error: 'Invalid zone' }, { status: 400 })
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
