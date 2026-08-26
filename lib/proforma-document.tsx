import type { ReactNode } from 'react'
import { Render } from '@puckeditor/core/rsc'
import type { Data } from '@puckeditor/core'
import { resolveThemeLayout } from '@/lib/layout/resolveThemeLayout'
import { injectInvoiceDocContext, type InvoiceDocContext } from '@/modules/shop/lib/invoice-doc-context'
import { PROFORMA_FALLBACK_DATA } from '@/modules/shop/lib/starterLayouts'

// Rendering the proforma document. Same two surfaces as the invoice - the page a
// customer opens, and a headless browser printing that same page - so the thing
// on screen and the thing in the PDF are one document by construction.
//
// Its own layout type, `shopProforma`, rather than the invoice's. A proforma
// says different things in different places (no tax point, a "this is not a VAT
// invoice" panel, lead times against every line, terms about when the clock
// starts), and an owner who wants to change any of that should not be editing
// the document their accountant reads. The BLOCKS are the invoice's, so a shop
// that has laid out one document already knows how to lay out the other.
//
// Like the invoice, it never refuses. A shop that switched proformas on and
// found a blank page would reasonably call it broken, and this layout type is
// new to every shop that already has the module - starters are seeded at
// install, so an existing shop has no `shopProforma` layout at all until
// somebody makes one. A missing layout falls back to the standard starter's own
// blocks, which is what a fresh install would have been given anyway.
//
// The live-logo freshening the invoice does is not repeated here and is not
// needed: nothing on a proforma is a snapshot, so `seller.logoUrl` is read from
// the media table on the way in and is current by construction.

export async function renderProformaDocument(ctx: InvoiceDocContext): Promise<ReactNode> {
  const layout = await resolveThemeLayout('shopProforma', { moduleName: 'shop' })
  const source = (layout?.builderData as Data | undefined) ?? (PROFORMA_FALLBACK_DATA as unknown as Data)

  // Loaded here rather than imported at the top, for the same reason the invoice
  // does it: config.rsc reaches next/headers through other modules' RSC blocks,
  // and a static import would drag that into every caller.
  const { getModuleLayoutPuckRscConfig } = await import('@/lib/puck/config.rsc')
  const data = injectInvoiceDocContext(source, ctx)
  return <Render config={getModuleLayoutPuckRscConfig('shopProforma')} data={data as Data} />
}
