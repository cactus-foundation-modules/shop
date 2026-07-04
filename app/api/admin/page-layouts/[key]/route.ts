import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireShopUser } from '@/modules/shop/lib/access'
import { getPageLayout, savePageLayout } from '@/modules/shop/lib/db'
import type { ShpPageLayoutKey } from '@/modules/shop/lib/types'

const VALID_KEYS: ShpPageLayoutKey[] = ['index', 'product', 'checkout', 'confirmation']

export async function GET(_request: Request, { params }: { params: Promise<{ key: string }> }) {
  const gate = await requireShopUser('shop.manage')
  if (gate.error) return gate.error

  const { key } = await params
  if (!VALID_KEYS.includes(key as ShpPageLayoutKey)) return NextResponse.json({ error: 'Unknown page layout key' }, { status: 404 })

  const layout = await getPageLayout(key as ShpPageLayoutKey)
  if (!layout) return NextResponse.json({ error: 'Layout not found' }, { status: 404 })
  return NextResponse.json({ layout })
}

const Body = z.object({ builderData: z.object({ root: z.object({ props: z.record(z.string(), z.unknown()).optional() }), content: z.array(z.unknown()), zones: z.record(z.string(), z.unknown()).optional() }) })

export async function PUT(request: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  const gate = await requireShopUser('shop.manage')
  if (gate.error) return gate.error

  const { key } = await params
  if (!VALID_KEYS.includes(key as ShpPageLayoutKey)) return NextResponse.json({ error: 'Unknown page layout key' }, { status: 404 })

  const parsed = Body.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: 'Invalid layout data' }, { status: 400 })

  await savePageLayout(key as ShpPageLayoutKey, parsed.data.builderData)
  return NextResponse.json({ success: true })
}
