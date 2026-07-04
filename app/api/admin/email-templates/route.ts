import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireShopUser } from '@/modules/shop/lib/access'
import { listEmailTemplates, updateEmailTemplate } from '@/modules/shop/lib/db'

export async function GET() {
  const gate = await requireShopUser('shop.manage')
  if (gate.error) return gate.error
  const templates = await listEmailTemplates()
  return NextResponse.json({ templates })
}

const Body = z.object({ trigger: z.string(), subject: z.string().optional(), bodyHtml: z.string().optional(), isActive: z.boolean().optional() })

export async function PUT(request: NextRequest) {
  const gate = await requireShopUser('shop.manage')
  if (gate.error) return gate.error
  const parsed = Body.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: 'Invalid template' }, { status: 400 })
  const { trigger, ...fields } = parsed.data
  await updateEmailTemplate(trigger as never, fields)
  return NextResponse.json({ success: true })
}
