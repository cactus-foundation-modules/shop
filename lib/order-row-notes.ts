// `shop.order-row-notes` - a module that knows something about an order gets
// one short line under its number and date on the orders list: where the
// customer came from, say ("via ChatGPT").
//
// Why a seam rather than a column: the fact is not shop's. Shop hands over the
// page of orders it is about to show (ids and numbers, nothing else) and prints
// whatever text comes back, as text. It knows nothing about what any line means.
//
// Server-only: a provider answers for an admin list and may read its own tables.
// Contribute it with `serverOnly: true` on the manifest entry. A provider that
// cares who is looking checks the session itself, as it would on any route.
import { getInstalledManifests } from '@/lib/modules/live-status'

export type OrderForRowNote = { id: string; orderNumber: string }

/** One line of text, and an optional longer version for the tooltip. */
export type OrderRowNote = { text: string; title?: string }

// Order id -> its line. An order the provider has nothing to say about is left out.
export type OrderRowNoteProvider = (
  orders: OrderForRowNote[],
) => Promise<Record<string, OrderRowNote>> | Record<string, OrderRowNote>

const POINT = 'shop.order-row-notes'
const MAX_TEXT = 120
const MAX_TITLE = 300

type ExtensionPointEntry = { point: string; id: string }

function clip(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null
  const v = value.trim().replace(/\s+/g, ' ')
  if (!v) return null
  return v.length > max ? `${v.slice(0, max - 1)}…` : v
}

/**
 * Every installed provider's line for each order, by order id, in manifest
 * order. Empty, with no work done, on a shop with no provider. A provider that
 * throws is logged and skipped: a missing line on the orders list is a shrug, a
 * list that will not load is not.
 */
export async function resolveOrderRowNotes(orders: OrderForRowNote[]): Promise<Record<string, OrderRowNote[]>> {
  const out: Record<string, OrderRowNote[]> = {}
  if (orders.length === 0) return out

  // Dynamic, and the SERVER map, for the reasons lib/order-line-due-date.ts gives.
  const { moduleServerExtensionPointComponents } = await import('@/lib/modules/extension-points.server')
  const providers = moduleServerExtensionPointComponents[POINT] ?? {}
  if (Object.keys(providers).length === 0) return out

  const known = new Set(orders.map((o) => o.id))
  const modules = await getInstalledManifests()
  for (const mod of modules) {
    const manifest = mod.manifest as { extensionPoints?: ExtensionPointEntry[] } | null
    if (!manifest?.extensionPoints) continue
    for (const entry of manifest.extensionPoints) {
      if (entry.point !== POINT) continue
      const provider = providers[entry.id] as OrderRowNoteProvider | undefined
      if (!provider) continue
      let answered: Record<string, OrderRowNote>
      try {
        answered = await provider(orders)
      } catch (error) {
        console.error(`[shop.order-row-notes] provider "${entry.id}" failed`, error)
        continue
      }
      for (const [orderId, note] of Object.entries(answered ?? {})) {
        // Checked rather than trusted: only orders on this page, only text.
        if (!known.has(orderId)) continue
        const text = clip(note?.text, MAX_TEXT)
        if (!text) continue
        const title = clip(note?.title, MAX_TITLE)
        ;(out[orderId] ??= []).push(title ? { text, title } : { text })
      }
    }
  }
  return out
}
