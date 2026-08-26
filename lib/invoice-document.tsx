import type { ReactNode } from 'react'
import { Render } from '@puckeditor/core/rsc'
import type { Data } from '@puckeditor/core'
import { prisma } from '@/lib/db/prisma'
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

/**
 * The picture at the top of the document: the site's logo as it stands today,
 * falling back to whatever was snapshotted when the invoice was raised.
 *
 * The snapshot exists so that a later edit in settings can never rewrite
 * paperwork already sent out - the figures, the addresses, the VAT number, the
 * wording. **A logo is none of those.** It is branding, and branding is expected
 * to be current; nobody reprints a two-year-old invoice hoping to see the old
 * mark on it.
 *
 * More to the point, a stored URL is a promise about a file that is not the
 * invoice's to keep. Replacing the logo in the media library re-points the
 * `Media` row and leaves the old file gone, so every invoice ever issued keeps a
 * URL that now 404s - which is exactly what happened here: two invoices raised
 * on the 24th, the logo replaced on the 25th, and a broken image at the top of
 * both from then on. Reading it live is the only version of this that stays
 * true, and it costs one indexed lookup on a page that already does several.
 */
export function preferLiveLogo(ctx: InvoiceDocContext, liveLogoUrl: string | null): InvoiceDocContext {
  if (!liveLogoUrl || liveLogoUrl === ctx.invoice.seller?.logoUrl) return ctx
  // Cloned rather than assigned into: the caller handed us a row it may still be
  // holding, and a render has no business editing it.
  return {
    ...ctx,
    invoice: { ...ctx.invoice, seller: { ...ctx.invoice.seller, logoUrl: liveLogoUrl } },
  }
}

/** The site's current logo, or null where there is none or the lookup fails. A
 *  document that cannot reach the media table still has its snapshot. */
async function currentSiteLogoUrl(): Promise<string | null> {
  const site = await prisma.siteConfig
    .findUnique({ where: { id: 'singleton' }, select: { logoMediaId: true } })
    .catch(() => null)
  if (!site?.logoMediaId) return null
  const media = await prisma.media
    .findUnique({ where: { id: site.logoMediaId }, select: { url: true } })
    .catch(() => null)
  return media?.url ?? null
}

/** The document as a React tree: the published `shopInvoice` layout with the
 *  context injected into its part-blocks, or the standard starter when the shop
 *  has not published one. */
export async function renderInvoiceDocument(ctx: InvoiceDocContext): Promise<ReactNode> {
  const [layout, liveLogoUrl] = await Promise.all([
    resolveThemeLayout('shopInvoice', { moduleName: 'shop' }),
    currentSiteLogoUrl(),
  ])
  const source = (layout?.builderData as Data | undefined) ?? (INVOICE_FALLBACK_DATA as unknown as Data)

  // Loaded here rather than imported at the top: config.rsc reaches next/headers
  // through other modules' RSC blocks, and a static import would drag that into
  // every caller.
  const { getModuleLayoutPuckRscConfig } = await import('@/lib/puck/config.rsc')
  // Every surface arrives here - the invoice page, the credit note page and the
  // PDF, which is a browser printing the first - so this is the one place the
  // logo has to be freshened.
  const data = injectInvoiceDocContext(source, preferLiveLogo(ctx, liveLogoUrl))
  return <Render config={getModuleLayoutPuckRscConfig('shopInvoice')} data={data as Data} />
}
