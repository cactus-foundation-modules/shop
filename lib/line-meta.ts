// Server-side carrier for per-line personalisation (spec §4.3). Shop stays
// generic: it knows nothing about what a "line meta" contains, only that a
// companion module can register a `shop.cart-line-resolver` provider which
// validates and prices the shopper's raw inputs for a given product.
//
// Precedent: contact-form.thread-messages -> getCaughtReplyThreadMessages. Like
// that one, the provider is a plain server function stored in the generated
// moduleExtensionPointComponents map, discovered via the active modules'
// manifests. It MUST be server-safe (this file runs inside lib/checkout.ts).
import { prisma } from '@/lib/db/prisma'
import { moduleExtensionPointComponents } from '@/lib/modules/extension-points'
import type { LineMeta, ShpProduct } from '@/modules/shop/lib/types'

// What a provider returns for one line. priceAdjust is added to the product's
// own price (server-authoritative - the client never sends a price). An invalid
// line fails exactly like an out-of-stock line, carrying a human reason.
export type CartLineResolution = {
  valid: boolean
  priceAdjust: number
  persistMeta: LineMeta | null
  reason?: string
}

export type CartLineResolver = (
  product: ShpProduct,
  meta: Record<string, unknown> | undefined,
) => Promise<CartLineResolution> | CartLineResolution

type ExtensionPointEntry = { point: string; id: string; permission?: string }

const POINT = 'shop.cart-line-resolver'

// Collected once per checkout resolution rather than per line. Returns [] when
// no module contributes (a shop-only site), so every code path below no-ops.
export async function getCartLineResolvers(): Promise<CartLineResolver[]> {
  const fns = moduleExtensionPointComponents[POINT] ?? {}
  if (Object.keys(fns).length === 0) return []
  const modules = await prisma.module.findMany({
    where: { status: { in: ['active', 'update_available'] } },
    select: { manifest: true },
  })
  const resolvers: CartLineResolver[] = []
  for (const mod of modules) {
    const manifest = mod.manifest as { extensionPoints?: ExtensionPointEntry[] } | null
    if (!manifest?.extensionPoints) continue
    for (const entry of manifest.extensionPoints) {
      if (entry.point !== POINT) continue
      const fn = fns[entry.id] as CartLineResolver | undefined
      if (fn) resolvers.push(fn)
    }
  }
  return resolvers
}

// Runs every provider for one line and folds the results: prices sum, fields
// concatenate, and any single invalid result fails the whole line. A line with
// no providers (or none that claim it) resolves valid with a zero adjustment.
export async function resolveLineMeta(
  product: ShpProduct,
  meta: Record<string, unknown> | undefined,
  resolvers: CartLineResolver[],
): Promise<CartLineResolution> {
  if (resolvers.length === 0) return { valid: true, priceAdjust: 0, persistMeta: null }

  let priceAdjust = 0
  let valid = true
  let reason: string | undefined
  const fields = []
  for (const resolve of resolvers) {
    const res = await resolve(product, meta)
    if (!res.valid) {
      valid = false
      reason = reason ?? res.reason
    }
    priceAdjust += Number.isFinite(res.priceAdjust) ? res.priceAdjust : 0
    if (res.persistMeta?.fields?.length) fields.push(...res.persistMeta.fields)
  }
  return { valid, priceAdjust, persistMeta: fields.length ? { fields } : null, reason }
}
