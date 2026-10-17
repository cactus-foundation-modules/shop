// Turning kit lines into the parts that actually leave the shelf. Pure, so the
// rule can be read and tested without a database; lib/db/product-components.ts
// does the reading.
//
// A kit has no stock of its own to take down - what it can make is worked out
// from its parts (migration 075), so selling one means taking each part off by
// the number that goes into one kit, times the number sold.

export type KitPart = { componentProductId: string; quantity: number }

/** Kit product id -> its parts. A product missing from the map is not a kit. */
export type KitParts = ReadonlyMap<string, readonly KitPart[]>

export type UnitLine = { productId: string; quantity: number }

/**
 * The units that really move for a set of lines: a kit becomes its parts, every
 * other line passes through, and the same product reached by two routes (sold
 * on its own and inside a kit, say) is summed into one figure.
 */
export function expandToParts(lines: readonly UnitLine[], kits: KitParts): Map<string, number> {
  const out = new Map<string, number>()
  const add = (productId: string, quantity: number) => out.set(productId, (out.get(productId) ?? 0) + quantity)
  for (const line of lines) {
    const quantity = Math.trunc(line.quantity)
    if (!Number.isFinite(quantity) || quantity <= 0) continue
    const parts = kits.get(line.productId)
    if (!parts || parts.length === 0) {
      add(line.productId, quantity)
      continue
    }
    for (const part of parts) add(part.componentProductId, quantity * part.quantity)
  }
  return out
}
