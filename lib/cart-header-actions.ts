// Server-side resolver for the `shop.cart-header-actions` extension point:
// controls a companion module puts on the cart page's own heading row, to the
// right of "Your cart".
//
// Why an extension point rather than a Puck block the site owner places: the
// controls that belong here are ones a shopper has to be able to find without
// having been told they exist - "Retrieve a quote" is no use to somebody
// carrying a code around if it only appears on carts whose owner remembered to
// place a block. Blocks stay the way to move one somewhere else; this is the way
// it is there at all on a shop that has only ever pressed Install.
//
// Shop knows nothing about what any action does. It renders each one on the
// heading row in manifest order and owns nothing but the row. Providers are
// rendered into the RSC tree, so each carries its own 'use client' boundary.
import type { ComponentType } from 'react'
import { prisma } from '@/lib/db/prisma'
import { INSTALLED_MODULE_WHERE } from '@/lib/modules/live-status'
import { moduleExtensionPointComponents } from '@/lib/modules/extension-points'

/** Reserved prop bag. Empty today; declared so adding a field later is not a
 *  breaking change for a provider built against this contract. */
export type ShopCartHeaderActionProps = { readonly reserved?: never }

export type ShopCartHeaderAction = {
  id: string
  Component: ComponentType<ShopCartHeaderActionProps>
}

type ExtensionPointEntry = { point: string; id: string; permission?: string }

const POINT = 'shop.cart-header-actions'

/**
 * Every installed module's cart-header action, in manifest order, with the
 * manifest entry's id for a stable React key. Returns [] on a shop with no
 * add-ons, in which case the cart page renders its heading exactly as before.
 */
export async function getShopCartHeaderActions(): Promise<ShopCartHeaderAction[]> {
  const components = moduleExtensionPointComponents[POINT] ?? {}
  if (Object.keys(components).length === 0) return []

  const modules = await prisma.module.findMany({
    where: { ...INSTALLED_MODULE_WHERE },
    select: { manifest: true },
  })

  const actions: ShopCartHeaderAction[] = []
  for (const mod of modules) {
    const manifest = mod.manifest as { extensionPoints?: ExtensionPointEntry[] } | null
    if (!manifest?.extensionPoints) continue
    for (const entry of manifest.extensionPoints) {
      if (entry.point !== POINT) continue
      const Component = components[entry.id] as ComponentType<ShopCartHeaderActionProps> | undefined
      if (Component) actions.push({ id: entry.id, Component })
    }
  }
  return actions
}
