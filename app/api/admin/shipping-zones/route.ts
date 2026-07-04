import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireShopUser } from '@/modules/shop/lib/access'
import { listShippingZones, createShippingZone } from '@/modules/shop/lib/db'

export async function GET() {
  const gate = await requireShopUser('shop.manage', { allowAccess: true })
  if (gate.error) return gate.error
  const zones = await listShippingZones()
  return NextResponse.json({ zones })
}

const Body = z.object({ name: z.string().min(1), postcodes: z.array(z.string()).default([]) })

export async function POST(request: NextRequest) {
  const gate = await requireShopUser('shop.manage')
  if (gate.error) return gate.error
  const parsed = Body.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid zone' }, { status: 400 })
  const { id } = await createShippingZone(parsed.data.name, parsed.data.postcodes)
  return NextResponse.json({ id }, { status: 201 })
}
