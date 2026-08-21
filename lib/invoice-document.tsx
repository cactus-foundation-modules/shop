import type { ReactNode } from 'react'
import { Render } from '@puckeditor/core/rsc'
import type { Data } from '@puckeditor/core'
import { resolveThemeLayout } from '@/lib/layout/resolveThemeLayout'
import { injectInvoiceDocContext, type InvoiceDocContext } from '@/modules/shop/lib/invoice-doc-context'
import { INVOICE_FALLBACK_DATA } from '@/modules/shop/lib/starterLayouts'
import type { ShpInvoice } from '@/modules/shop/lib/types'

// Rendering the invoice document. One layout, two surfaces:
//
//  - /shop/invoice/<number>   the page a customer or an admin opens
//  - the PDF                  a headless browser printing that same page
//
// Both go through here, so the thing on screen and the thing in the PDF are the
// same document by construction rather than by two renderings agreeing with
// each other for now.
//
// Unlike the quote document, this one NEVER refuses. A quote with no published
// layout can say "ask an administrator to publish one"; an invoice cannot,
// because it may be the customer's only copy of a legal record and because the
// layout type is new to any shop that already had this module installed - module
// layout starters are seeded at install, so an existing shop has no shopInvoice
// layout at all until somebody creates one. So a missing layout falls back to
// the standard starter's own blocks, which is what that shop would have been
// given on a fresh install anyway.

/** Everything the document's blocks need. The invoice is already a complete
 *  snapshot, so there is nothing else to gather. */
export function invoiceDocContext(invoice: ShpInvoice, opts?: { print?: boolean }): InvoiceDocContext {
  return { invoice, print: opts?.print ?? false }
}

/** The document as a React tree: the published `shopInvoice` layout with the
 *  context injected into its part-blocks, or the standard starter when the shop
 *  has not published one. */
export async function renderInvoiceDocument(ctx: InvoiceDocContext): Promise<ReactNode> {
  const layout = await resolveThemeLayout('shopInvoice', { moduleName: 'shop' })
  const source = (layout?.builderData as Data | undefined) ?? (INVOICE_FALLBACK_DATA as unknown as Data)

  // Loaded here rather than imported at the top: config.rsc reaches next/headers
  // through other modules' RSC blocks, and a static import would drag that into
  // every caller.
  const { getModuleLayoutPuckRscConfig } = await import('@/lib/puck/config.rsc')
  const data = injectInvoiceDocContext(source, ctx)
  return <Render config={getModuleLayoutPuckRscConfig('shopInvoice')} data={data as Data} />
}
