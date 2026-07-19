import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { requireShopUser } from '@/modules/shop/lib/access'
import { getShopConfig, updateShopConfig, ShpConfigSchema } from '@/modules/shop/lib/config'
import { isStripeConfigured, isPayPalConfigured } from '@/modules/shop/lib/env'
import { syncSupplierNavEntry } from '@/modules/shop/lib/supplier-nav'

export async function GET() {
  const gate = await requireShopUser('shop.manage')
  if (gate.error) return gate.error
  const config = await getShopConfig()

  // Self-heal the Suppliers sidebar link, which a module update resets back to
  // absent - see supplier-nav.ts. No-ops when it already agrees with the setting.
  await syncSupplierNavEntry(config.supplierFieldEnabled)

  // Store email has never been set — prefill (display-only, not yet persisted)
  // with the first admin's address so there's a sane default to send from/reply to.
  if (!config.storeEmail) {
    const firstAdmin = await prisma.user.findFirst({ where: { role: { isProtected: true } }, orderBy: { createdAt: 'asc' } })
    if (firstAdmin) config.storeEmail = firstAdmin.email
  }

  return NextResponse.json({ config, envStatus: { stripe: isStripeConfigured(), paypal: isPayPalConfigured() } })
}

export async function PUT(request: NextRequest) {
  const gate = await requireShopUser('shop.manage')
  if (gate.error) return gate.error

  const body = await request.json()
  const parsed = ShpConfigSchema.partial().safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid config' }, { status: 400 })

  const config = await updateShopConfig(parsed.data)
  // Add or drop the Suppliers sidebar link to match the setting just saved.
  await syncSupplierNavEntry(config.supplierFieldEnabled)
  return NextResponse.json({ config })
}
