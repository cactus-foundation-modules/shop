import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireShopUser } from '@/modules/shop/lib/access'
import { listTaxZoneRates, upsertTaxZoneRate } from '@/modules/shop/lib/db'

export async function GET(request: NextRequest) {
  const gate = await requireShopUser('shop.manage', { allowAccess: true })
  if (gate.error) return gate.error
  const zoneId = request.nextUrl.searchParams.get('zoneId') ?? undefined
  const rates = await listTaxZoneRates(zoneId)
  return NextResponse.json({ rates })
}

const Body = z.object({ zoneId: z.string(), taxClassId: z.string(), rate: z.number().min(0).max(1) })

export async function POST(request: NextRequest) {
  const gate = await requireShopUser('shop.manage')
  if (gate.error) return gate.error
  const parsed = Body.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid rate' }, { status: 400 })
  await upsertTaxZoneRate(parsed.data.zoneId, parsed.data.taxClassId, parsed.data.rate)
  return NextResponse.json({ success: true }, { status: 201 })
}
