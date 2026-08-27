import { describe, it, expect } from 'vitest'
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
// added to the list below - which is the only thing this test asks of anybody.

type FieldDef = { type?: string; label?: string; render?: (props: Record<string, unknown>) => React.ReactNode }
type BlockDef = { label: string; fields: Record<string, FieldDef> }

const DOCUMENT_BLOCKS: BlockDef[] = [
  shopInvoiceHeaderPuckComponent, shopInvoicePartiesPuckComponent,
  shopInvoiceFromPuckComponent, shopInvoiceToPuckComponent,
  shopInvoiceLinesPuckComponent, shopInvoiceTotalsPuckComponent,
  shopInvoiceTaxSummaryPuckComponent, shopInvoicePaymentPuckComponent,
  shopInvoiceStylePuckComponent, shopInvoiceNoticePuckComponent,
  shopInvoiceFooterPuckComponent, shopInvoiceDividerPuckComponent,
  shopInvoicePageNumberPuckComponent,
] as unknown as BlockDef[]

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
