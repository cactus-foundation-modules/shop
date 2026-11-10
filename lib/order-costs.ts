// `shop.order-costs` - a module that knows what an order cost the shop gets to
// say so, and Reports > Profits takes it off what the customer paid.
//
// Why a seam rather than a column: the cost is not shop's. Purchase orders know
// what the supplier was asked for and what they invoiced; a module that buys
// postage would know the label. Shop hands over the orders it is reporting on
// (ids and numbers, nothing else) and adds up whatever comes back. It knows
// nothing about what any entry means beyond its label and its amount.
//
// Server-only: a provider answers for an admin report and reads its own tables.
// Contribute it with `serverOnly: true` on the manifest entry.
//
// THE CONTRACT. Every amount is NET of tax and in the shop's own currency - the
// provider converts, because only it knows the rate it bought at. `basis` says
// how sure the figure is: 'billed' is what the supplier actually invoiced,
// 'ordered' is what was asked for and not yet invoiced. A credit is a negative
// amount, never a separate kind.
import { getInstalledManifests } from '@/lib/modules/live-status'

export type OrderForCost = { id: string; orderNumber: string }

export type OrderCostBasis = 'billed' | 'ordered'

export type OrderCost = {
  /** Short reference a person recognises: "PO-00027". */
  ref: string
  /** Who or what it was paid to: the supplier's name. */
  label?: string
  /** Where to see it, as an admin path WITHOUT the admin prefix: "m/purchase-orders/orders/<id>". */
  path?: string
  /** The provider's own word for where it has got to: "Closed", "Draft". */
  status?: string
  /** Billed costs only: the date the supplier invoiced it, as YYYY-MM-DD. */
  invoicedOn?: string
  amount: number
  basis: OrderCostBasis
}

// `null` is "not for this viewer" - a provider that checks who is looking and
// finds they may not see its figures. Reported like a failure, so the report
// says costs are missing instead of showing every order as pure profit.
export type OrderCostProvider = (
  orders: OrderForCost[],
) => Promise<Record<string, OrderCost[]> | null> | Record<string, OrderCost[]> | null

/** One provider's entry with the provider it came from, as Reports shows it. */
export type ResolvedOrderCost = OrderCost & { source: string }

const POINT = 'shop.order-costs'
const MAX_TEXT = 80

type ExtensionPointEntry = { point: string; id: string; label?: string }

function clip(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const v = value.trim().replace(/\s+/g, ' ')
  if (!v) return undefined
  return v.length > MAX_TEXT ? `${v.slice(0, MAX_TEXT - 1)}…` : v
}

/**
 * Every installed provider's costs for each order, by order id, in manifest
 * order, and whether any provider is installed at all - a shop with none has no
 * costs to report, which is a different thing from orders that cost nothing.
 * A provider that throws is logged and skipped, and named in `failed` so the
 * report can say its figures are missing rather than quietly overstate profit.
 */
export async function resolveOrderCosts(orders: OrderForCost[]): Promise<{
  costs: Record<string, ResolvedOrderCost[]>
  providers: string[]
  failed: string[]
}> {
  const costs: Record<string, ResolvedOrderCost[]> = {}
  const providers: string[] = []
  const failed: string[] = []

  // Dynamic, and the SERVER map, for the reasons lib/order-line-due-date.ts gives.
  const { moduleServerExtensionPointComponents } = await import('@/lib/modules/extension-points.server')
  const registered = moduleServerExtensionPointComponents[POINT] ?? {}
  if (Object.keys(registered).length === 0) return { costs, providers, failed }

  const known = new Set(orders.map((o) => o.id))
  const modules = await getInstalledManifests()
  for (const mod of modules) {
    const manifest = mod.manifest as { extensionPoints?: ExtensionPointEntry[] } | null
    if (!manifest?.extensionPoints) continue
    for (const entry of manifest.extensionPoints) {
      if (entry.point !== POINT) continue
      const provider = registered[entry.id] as OrderCostProvider | undefined
      if (!provider) continue
      const source = entry.label ?? entry.id
      providers.push(source)
      if (orders.length === 0) continue
      let answered: Record<string, OrderCost[]> | null
      try {
        answered = await provider(orders)
      } catch (error) {
        console.error(`[shop.order-costs] provider "${entry.id}" failed`, error)
        failed.push(source)
        continue
      }
      if (answered === null) {
        failed.push(source)
        continue
      }
      for (const [orderId, list] of Object.entries(answered ?? {})) {
        // Checked rather than trusted: only orders asked about, only finite money.
        if (!known.has(orderId) || !Array.isArray(list)) continue
        for (const cost of list) {
          const amount = Number(cost?.amount)
          const ref = clip(cost?.ref)
          if (!ref || !Number.isFinite(amount)) continue
          const path = typeof cost.path === 'string' && /^[\w\-/]+$/.test(cost.path) ? cost.path.replace(/^\/+/, '') : undefined
          ;(costs[orderId] ??= []).push({
            source,
            ref,
            label: clip(cost.label),
            path,
            status: clip(cost.status),
            invoicedOn: typeof cost.invoicedOn === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(cost.invoicedOn) ? cost.invoicedOn : undefined,
            amount: Math.round(amount * 100) / 100,
            basis: cost.basis === 'billed' ? 'billed' : 'ordered',
          })
        }
      }
    }
  }
  return { costs, providers, failed }
}
