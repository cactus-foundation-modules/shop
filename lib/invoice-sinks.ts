import { prisma } from '@/lib/db/prisma'
import { INSTALLED_MODULE_WHERE } from '@/lib/modules/live-status'
import { moduleExtensionPointComponents } from '@/lib/modules/extension-points'
import type { ShpInvoiceSinkResult, ShpInvoiceTaxRow } from '@/modules/shop/lib/types'

// `shop.invoice-issued` - the seam a bookkeeping module hangs off.
//
// Shop knows nothing about bookkeeping, VAT schemes, chart-of-accounts codes or
// HMRC, and this file is what keeps it that way. When an invoice is issued, shop
// hands a plain, serialisable statement of fact to every module that registered
// at the point and records what each one said. A shop with no such module
// installed gathers nothing and does nothing - no query, no branch, no setting.
//
// The payload is the contract. It is deliberately flat and self-describing: the
// module on the other end must never have to import a shop type, because it
// does not depend on shop and its files still have to compile on a site where
// this module is absent. Net/tax/gross per rate is the part that matters - it
// is what a VAT return is worked out from, and shop is the only thing that
// knows how the money was actually charged.
//
// Adding a field is safe. Renaming or repurposing one is not: a module built
// against the old shape is out there on somebody's site, so an incompatible
// change needs a new point name.

export type ShopInvoiceSinkPayload = {
  /** Always 'shop'. A recorder may register at more than one publisher's point
   *  and needs to say where a record came from. */
  source: 'shop'
  invoiceId: string
  invoiceNumber: string
  orderId: string
  orderNumber: string
  /** ISO timestamp of issue. */
  issuedAt: string
  /** yyyy-mm-dd. The date the VAT belongs to. */
  taxPointDate: string
  /** yyyy-mm-dd the order was paid, or null if it has not been. */
  settledDate: string | null
  currency: string
  taxMode: 'INCLUSIVE' | 'EXCLUSIVE'
  customer: { name: string; company: string; email: string }
  /** The whole invoice: net, tax and gross as decimal strings. */
  totals: { net: string; tax: string; gross: string }
  /** Net, tax and gross at each rate, summing to `totals`. */
  taxBreakdown: ShpInvoiceTaxRow[]
  /** A sentence for the entry's description, already written in English. */
  description: string
  /** Absolute, signed link to the invoice document, for filing as evidence.
   *  Null if the site has no address configured. */
  documentUrl: string | null
}

/** What a registered module does with one. Never throws in the caller's face -
 *  see dispatchInvoiceIssued, which treats a throw as a failed sink rather than
 *  a failed invoice. */
export type ShopInvoiceSink = (
  payload: ShopInvoiceSinkPayload,
) => Promise<{ ok: boolean; message: string }> | { ok: boolean; message: string }

const POINT = 'shop.invoice-issued'

type ExtensionPointEntry = { point: string; id: string }

async function gatherSinks(): Promise<{ id: string; sink: ShopInvoiceSink }[]> {
  const fns = moduleExtensionPointComponents[POINT] ?? {}
  if (Object.keys(fns).length === 0) return []
  const modules = await prisma.module.findMany({
    where: { ...INSTALLED_MODULE_WHERE },
    select: { name: true, manifest: true },
  })
  const gathered: { id: string; sink: ShopInvoiceSink }[] = []
  for (const mod of modules) {
    const manifest = mod.manifest as { extensionPoints?: ExtensionPointEntry[] } | null
    for (const entry of manifest?.extensionPoints ?? []) {
      if (entry.point !== POINT) continue
      const fn = fns[entry.id] as ShopInvoiceSink | undefined
      if (fn) gathered.push({ id: entry.id, sink: fn })
    }
  }
  return gathered
}

/** Whether anything is listening at all, for the admin screen to decide whether
 *  a "send to the books again" button makes any sense. */
export async function hasInvoiceSinks(): Promise<boolean> {
  return (await gatherSinks()).length > 0
}

/**
 * Hands one issued invoice to every registered sink and reports what each said.
 *
 * A sink that fails NEVER fails the invoice. The order has been paid and the
 * paperwork is raised; a bookkeeping module that is mid-VAT-return, or simply
 * broken, must not roll that back or block the status change that caused it.
 * The failure is recorded on the invoice instead, where the owner can see it
 * and press the button again.
 */
export async function dispatchInvoiceIssued(payload: ShopInvoiceSinkPayload): Promise<ShpInvoiceSinkResult[]> {
  const sinks = await gatherSinks()
  const results: ShpInvoiceSinkResult[] = []
  for (const { id, sink } of sinks) {
    const at = new Date().toISOString()
    try {
      const outcome = await sink(payload)
      results.push({ id, ok: Boolean(outcome?.ok), message: String(outcome?.message ?? '').slice(0, 500), at })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.error(`[shop] invoice sink "${id}" failed for ${payload.invoiceNumber}:`, message)
      results.push({ id, ok: false, message: message.slice(0, 500), at })
    }
  }
  return results
}
