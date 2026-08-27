import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  shopInvoiceHeaderPuckComponent, shopInvoicePartiesPuckComponent,
  shopInvoiceFromPuckComponent, shopInvoiceToPuckComponent,
  shopInvoiceLinesPuckComponent, shopInvoiceTotalsPuckComponent,
  shopInvoiceTaxSummaryPuckComponent, shopInvoicePaymentPuckComponent,
} from '@/modules/shop/components/puck/invoice-parts'
import {
  shopInvoiceStylePuckComponent, shopInvoiceNoticePuckComponent,
  shopInvoiceFooterPuckComponent, shopInvoiceDividerPuckComponent,
  shopInvoicePageNumberPuckComponent,
} from '@/modules/shop/components/puck/invoice-chrome'
import { shopDocPageSettings } from '@/modules/shop/lib/doc-page-settings'
import { documentFooterPageSettings } from '@/lib/documents/page-settings'

// Puck draws the label for its own field types. It does NOT draw one for
// `type: 'custom'`: that field is handed the whole row and is expected to head
// itself, which is why every core widget reads `field.label` and renders a
// <label> (lib/puck/UnitValueField.tsx, BgColorField.tsx, MenuSelectField.tsx).
//
// This module's custom fields did not, for as long as they have existed. The
// font and colour pickers on every document block sat in the panel as bare
// controls, and the px size, radius and spacing menus added later made it about
// thirty unlabelled boxes in a row, every one of them reading "Default". There
// was no way to tell which one rounded the item table's headings.
//
// Nothing else can catch that. A field with no label type-checks, lints and
// renders perfectly; it is simply unusable. So every custom field on every
// document block is rendered here and checked for its own label.
//
// A new block, or a new custom field on an old one, is covered the moment it is
// added to BLOCKS_BY_TYPE below - and the coverage check further down reads the
// manifest and fails if a block a document layout offers was never added, so
// nobody has to remember.

type FieldDef = { type?: string; label?: string; render?: (props: Record<string, unknown>) => React.ReactNode }
type BlockDef = { label: string; fields: Record<string, FieldDef> }

/** Keyed by the manifest's block `type`, so the coverage check below can tell
 *  whether a block offered on a document layout is actually audited here. */
const BLOCKS_BY_TYPE: Record<string, BlockDef> = {
  ShopInvoiceHeader: shopInvoiceHeaderPuckComponent,
  ShopInvoiceParties: shopInvoicePartiesPuckComponent,
  ShopInvoiceFrom: shopInvoiceFromPuckComponent,
  ShopInvoiceTo: shopInvoiceToPuckComponent,
  ShopInvoiceLines: shopInvoiceLinesPuckComponent,
  ShopInvoiceTotals: shopInvoiceTotalsPuckComponent,
  ShopInvoiceTaxSummary: shopInvoiceTaxSummaryPuckComponent,
  ShopInvoicePayment: shopInvoicePaymentPuckComponent,
  ShopInvoiceStyle: shopInvoiceStylePuckComponent,
  ShopInvoiceNotice: shopInvoiceNoticePuckComponent,
  ShopInvoiceFooter: shopInvoiceFooterPuckComponent,
  ShopInvoiceDivider: shopInvoiceDividerPuckComponent,
  ShopInvoicePageNumber: shopInvoicePageNumberPuckComponent,
} as unknown as Record<string, BlockDef>

const DOCUMENT_BLOCKS: BlockDef[] = Object.values(BLOCKS_BY_TYPE)

/** Every layout type these blocks are offered on. The proforma draws itself with
 *  the invoice's own blocks and the credit note draws itself on the invoice's own
 *  layout, so those two are the same set - but that is a fact about the manifest,
 *  and the manifest is where it gets checked rather than somewhere it gets
 *  assumed. `documentFooter` is CORE's, shared by every module that prints
 *  paperwork; the shop's own `shopDocumentFooter` retired into it (migration
 *  030). */
const DOCUMENT_LAYOUT_TYPES = ['shopInvoice', 'shopProforma', 'documentFooter']

type Manifest = { puckBlocks: { type: string; layoutTypes?: string[] }[] }
const manifest: Manifest = JSON.parse(
  readFileSync(join(__dirname, '..', '..', 'cactus.module.json'), 'utf8'),
)

/** The text a person actually sees, with the markup and React's escaping taken
 *  back off - labels here carry quotes, brackets and ellipses. */
function visibleText(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
}

/** Every custom field on every document block, as [block, field name, field]. */
const CUSTOM_FIELDS: [string, string, FieldDef][] = DOCUMENT_BLOCKS.flatMap((block) =>
  Object.entries(block.fields)
    .filter(([, field]) => field?.type === 'custom')
    .map(([name, field]) => [block.label, name, field] as [string, string, FieldDef]),
)

describe('every custom field on an invoice document block heads itself', () => {
  it('there are custom fields to check at all', () => {
    // Guards against the list above going stale and this file passing on
    // nothing, which is how a test like this dies quietly.
    expect(CUSTOM_FIELDS.length).toBeGreaterThan(20)
  })

  it.each(CUSTOM_FIELDS)('%s > %s declares a label', (_block, _name, field) => {
    expect(field.label?.trim()).toBeTruthy()
  })

  it.each(CUSTOM_FIELDS)('%s > %s draws that label', (_block, name, field) => {
    // The widget itself renders nothing here - the field registry is only
    // populated inside the admin editor, and its proxies render null everywhere
    // else. That is exactly what makes this a fair test of the WRAPPER: the
    // label has to come from this module's own markup, not from the widget.
    const html = renderToStaticMarkup(
      <>{field.render?.({ value: '', onChange: () => {}, field, name, id: name })}</>,
    )
    expect(visibleText(html)).toContain(field.label)
  })
})

describe('the audit covers every block a document layout actually offers', () => {
  // Without this the list above is a list somebody remembered to update. A new
  // block added to the invoice - or to the proforma, which shares the invoice's
  // blocks entirely - would otherwise go unaudited and the suite would stay
  // green while its fields sat unlabelled in the panel.
  it.each(DOCUMENT_LAYOUT_TYPES)('%s', (layoutType) => {
    const offered = manifest.puckBlocks
      .filter((block) => block.layoutTypes?.includes(layoutType))
      .map((block) => block.type)

    expect(offered.length).toBeGreaterThan(0)
    expect(offered.filter((type) => !BLOCKS_BY_TYPE[type]).sort()).toEqual([])
  })

  it('the proforma is drawn by exactly the invoice blocks', () => {
    // Not a rule anything enforces - it is simply how they are registered, and
    // it is the reason auditing "the invoice blocks" audits the proforma too.
    // If the two ever diverge, this says so rather than leaving the claim
    // standing in a release note.
    const forType = (layoutType: string) =>
      manifest.puckBlocks
        .filter((block) => block.layoutTypes?.includes(layoutType))
        .map((block) => block.type)
        .sort()
    expect(forType('shopProforma')).toEqual(forType('shopInvoice'))
  })
})

describe('page settings head themselves too', () => {
  // The root fields - paper, margins, scale - are the panel shown with nothing
  // selected. Puck labels its own field types, so these only need checking for
  // not quietly becoming custom ones.
  const roots = [
    ['document', shopDocPageSettings],
    ['document footer', documentFooterPageSettings],
  ] as [string, { fields: Record<string, FieldDef> }][]

  it.each(roots)('%s page settings', (_name, root) => {
    for (const [name, field] of Object.entries(root.fields)) {
      expect(field.label?.trim(), `${name} has no label`).toBeTruthy()
      // A custom root field would have to draw its own label, exactly as the
      // block fields above do. None do today; this is the tripwire if one lands.
      expect(field.type, `${name} is custom and must draw its own label`).not.toBe('custom')
    }
  })
})
