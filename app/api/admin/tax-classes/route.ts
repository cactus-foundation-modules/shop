import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireShopUser } from '@/modules/shop/lib/access'
import { listTaxClasses, createTaxClass } from '@/modules/shop/lib/db'

export async function GET() {
  const gate = await requireShopUser('shop.manage', { allowAccess: true })
  if (gate.error) return gate.error
  const taxClasses = await listTaxClasses()
  return NextResponse.json({ taxClasses })
}

const Body = z.object({ name: z.string().min(1), code: z.string().min(1) })

export async function POST(request: NextRequest) {
  const gate = await requireShopUser('shop.manage')
  if (gate.error) return gate.error
  const parsed = Body.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid tax class' }, { status: 400 })
  const { id } = await createTaxClass(parsed.data.name, parsed.data.code)
  return NextResponse.json({ id }, { status: 201 })
}
