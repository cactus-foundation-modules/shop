import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { requireShopUser } from '@/modules/shop/lib/access'
import { updateTaxClass, deleteTaxClass } from '@/modules/shop/lib/db'

const Body = z.object({ name: z.string().min(1).optional(), code: z.string().min(1).optional() })

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireShopUser('shop.manage')
  if (gate.error) return gate.error
  const { id } = await params
  const parsed = Body.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: 'Invalid tax class' }, { status: 400 })
  try {
    await updateTaxClass(id, parsed.data)
  } catch (err) {
    const isUniqueViolation = err instanceof Prisma.PrismaClientKnownRequestError
      && (err.code === 'P2002' || (err.code === 'P2010' && String(err.meta?.message ?? '').includes('unique constraint')))
    if (isUniqueViolation) {
      return NextResponse.json({ error: 'That code is already used by another tax class.' }, { status: 409 })
    }
    throw err
  }
  return NextResponse.json({ success: true })
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireShopUser('shop.manage')
  if (gate.error) return gate.error
  const { id } = await params
  await deleteTaxClass(id)
  return NextResponse.json({ success: true })
}
