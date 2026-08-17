import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { requireShopUser } from '@/modules/shop/lib/access'
import { getShopConfig, updateShopConfig, ShpConfigSchema, BUILT_IN_PAYMENT_METHODS } from '@/modules/shop/lib/config'
import { getAllPaymentProviders, getModuleProviderEntryIds, resolveProviderLabel } from '@/modules/shop/lib/payments/registry'
import type { ShpAdminPaymentMethod } from '@/modules/shop/lib/payments/admin-methods'
import { isStripeConfigured, isPayPalConfigured } from '@/modules/shop/lib/env'
import { syncSupplierNavEntry } from '@/modules/shop/lib/supplier-nav'
import { getMembersConfig } from '@/lib/members/config'

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

  // "Prompt guests to create an account" is a shop switch with a dependency
  // outside the shop: there has to be somewhere for a guest to register. With
  // the site's member system off, or registration invite-only, the switch is on
  // and does nothing - and the only way an owner found that out was by placing
  // an order and watching the prompt not appear. Reported so the settings screen
  // can say so instead.
  const members = await getMembersConfig()

  return NextResponse.json({
    config,
    envStatus: { stripe: isStripeConfigured(), paypal: isPayPalConfigured() },
    members: { enabled: members.enabled, inviteOnly: members.registrationMode === 'INVITE_ONLY' },
    paymentMethods: await listPaymentMethodsForAdmin(),
  })
}

// Every payment method registered on this site - shop's own four plus whatever
// installed modules contribute - so the Payments tab can list, switch and
// arrange all of them without shop naming a single module. `ready` is only ever
// about the method's own side of things (keys entered, module connected and
// switched on); shop's own on/off switch is config, and the screen reads it
// from there.
async function listPaymentMethodsForAdmin(): Promise<ShpAdminPaymentMethod[]> {
  const builtInIds = BUILT_IN_PAYMENT_METHODS as readonly string[]
  const panelIds = getModuleProviderEntryIds()

  return Promise.all(getAllPaymentProviders().map(async (provider) => {
    const builtIn = builtInIds.includes(provider.id)
    let ready = true
    if (provider.id === 'STRIPE') ready = isStripeConfigured()
    else if (provider.id === 'PAYPAL') ready = isPayPalConfigured()
    else if (!builtIn) ready = provider.isAvailable ? await provider.isAvailable() : true

    return {
      id: provider.id,
      label: await resolveProviderLabel(provider),
      defaultDescription: (provider.description ?? '').trim(),
      logo: provider.logo ?? null,
      builtIn,
      ready,
      panelId: builtIn ? null : (panelIds[provider.id] ?? null),
    }
  }))
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
