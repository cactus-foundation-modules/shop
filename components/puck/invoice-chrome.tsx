import type { CSSProperties } from 'react'
import {
  Style, FontLink, fontStyle, fontField, headingFontField, sizeField, radiusField, spaceField, sizeVars, cssLength,
  colourField, yesNo, fillTokens, invoiceTokens, paragraphs, useCtx, TOKEN_HINT,
  type DocProps,
} from '@/modules/shop/components/puck/invoice-shared'

// The invoice document's chrome: the four blocks that carry no figures of their
// own. One sets the document's colours and spacing for every other block; the
// other three - a notice panel, a footer and a rule - are things an owner writes
// or draws rather than things the invoice supplies.
//
// Same contract as invoice-parts.tsx: one render path each, shared by the Puck
// editor and the storefront, so the document in the editor and the document in
// the PDF are the same by construction. Nothing here is a client component.

// ---------------------------------------------------------------------------
// Document style
// ---------------------------------------------------------------------------
//
// One block, dropped once anywhere on the layout, that sets the document's
// accent colour, its table fill, its rule weight and its spacing. Everything
// else reads those through `--shp-inv-*` custom properties with fallbacks that
// are exactly the old hard-coded values, so:
//
//   - a layout with no style block looks precisely as it did before this
//     existed, which matters on an install whose invoice layout is published
//     and whose accountant has seen it, and
//   - an owner who wants their accent colour on the heading rule, the total
//     rule, the notice bar and the footer changes one field rather than four.
//
// The properties are set ON THE PART CLASSES, not on `:root`. In the Puck editor
// the canvas shares a document with the admin UI, and a document-wide rule from
// a block being previewed has no business reaching the sidebar. Listing the part
// classes keeps every declaration inside the document - a custom property set on
// an element is inherited by its own subtree and nothing else - and each part is
// a root of its own, so listing them all covers the document exactly.
//
// A part added later must be added to this list, or it silently keeps the
// fallbacks. There is a test that fails when it drifts.

export const INVOICE_DOC_SCOPE_CLASSES = [
  'shp-inv-head',
  'shp-inv-intro',
  'shp-inv-lead',
  'shp-inv-parties',
  'shp-inv-lines',
  'shp-inv-totals',
  'shp-inv-paid',
  'shp-inv-vat',
  'shp-inv-pay',
  'shp-inv-foot',
  'shp-inv-notice',
  'shp-inv-footer',
  'shp-inv-rule',
  'shp-inv-pageno',
]

const RULE_WEIGHTS: Record<string, string> = {
  hairline: '1px',
  medium: '2px',
  thick: '3px',
  heavy: '5px',
}

const RADII: Record<string, string> = {
  square: '0',
  soft: '4px',
  round: '10px',
}

/** Table row padding, top and bottom. Roomy is a document with a dozen lines on
 *  it; compact is one with sixty and a page limit. */
const DENSITIES: Record<string, { row: string; gap: string; gapLg: string }> = {
  compact: { row: '0.375rem', gap: '1rem', gapLg: '1.25rem' },
  normal: { row: '0.625rem', gap: '1.5rem', gapLg: '1.75rem' },
  roomy: { row: '0.9375rem', gap: '2.25rem', gapLg: '2.75rem' },
}

type StyleProps = {
  accent?: string; labelColour?: string; titleColour?: string
  tableHeadBg?: string; tableHeadInk?: string
  panelBg?: string; panelInk?: string; zebraBg?: string
  ruleWeight?: string; ruleWeightPx?: string; corners?: string; cornerRadius?: string; density?: string
  blockGap?: string; blockGapLarge?: string
  bodyFont?: string; headingFont?: string
}

/** `--name: value;` for every field an owner actually set. A blank field emits
 *  nothing at all rather than an empty value, so the CSS fallback stands and the
 *  document keeps whatever it had. */
function declarations(pairs: [string, string | undefined][]): string {
  return pairs
    .filter(([, value]) => Boolean(value && value.trim()))
    .map(([name, value]) => `${name}: ${value!.trim()};`)
    .join(' ')
}

export function ShopInvoiceStyle(props: StyleProps) {
  // 'normal' is what the stylesheet already falls back to, so saying it again
  // would emit three declarations that change nothing - and would stop a block
  // nobody has touched from being provably identical to no block at all.
  const density = props.density && props.density !== 'normal' ? DENSITIES[props.density] : undefined
  const css = declarations([
    ['--shp-inv-accent', props.accent],
    ['--shp-inv-label', props.labelColour],
    ['--shp-inv-title-ink', props.titleColour],
    ['--shp-inv-thead-bg', props.tableHeadBg],
    ['--shp-inv-thead-ink', props.tableHeadInk],
    ['--shp-inv-panel-bg', props.panelBg],
    ['--shp-inv-panel-ink', props.panelInk],
    ['--shp-inv-zebra-bg', props.zebraBg],
    // The picked thickness, or an exact one where an owner asked for exactly
    // that. The exact box wins, and blank in it leaves the menu standing.
    ['--shp-inv-rule-w', cssLength(props.ruleWeightPx) ?? RULE_WEIGHTS[props.ruleWeight ?? '']],
    // Same again for corners: three presets for an owner who wants one look, and
    // a px menu for one who has a number in mind.
    ['--shp-inv-radius', cssLength(props.cornerRadius) ?? RADII[props.corners ?? '']],
    ['--shp-inv-row-y', density?.row],
    ['--shp-inv-gap', cssLength(props.blockGap) ?? density?.gap],
    ['--shp-inv-gap-lg', cssLength(props.blockGapLarge) ?? density?.gapLg],
    ['--shp-inv-body-font', props.bodyFont?.trim()],
    ['--shp-inv-head-font', props.headingFont?.trim()],
  ])

  const selector = INVOICE_DOC_SCOPE_CLASSES.map((name) => `.${name}`).join(', ')
  return (
    <>
      <Style />
      <FontLink family={props.bodyFont} />
      <FontLink family={props.headingFont} />
      {css && <style dangerouslySetInnerHTML={{ __html: `${selector} { ${css} }` }} />}
    </>
  )
}

export const shopInvoiceStylePuckComponent = {
  label: 'Document: Style',
  fields: {
    accent: colourField('Accent colour (rules, the total, the notice bar)'),
    labelColour: colourField('Small headings ("Invoice to", "Terms")'),
    titleColour: colourField('Heading and total'),
    tableHeadBg: colourField('Item table header background'),
    tableHeadInk: colourField('Item table header text'),
    panelBg: colourField('Notice panel background'),
    panelInk: colourField('Notice panel text'),
    zebraBg: colourField('Alternating row shading'),
    ruleWeight: { type: 'select' as const, label: 'Accent rule thickness', options: [
      { value: 'hairline', label: 'Hairline' },
      { value: 'medium', label: 'Medium' },
      { value: 'thick', label: 'Thick' },
      { value: 'heavy', label: 'Heavy' },
    ] },
    ruleWeightPx: spaceField('…or exactly this thick'),
    corners: { type: 'select' as const, label: 'Corners', options: [
      { value: 'square', label: 'Square' },
      { value: 'soft', label: 'Slightly rounded' },
      { value: 'round', label: 'Rounded' },
    ] },
    cornerRadius: radiusField('…or exactly this radius'),
    density: { type: 'select' as const, label: 'Spacing', options: [
      { value: 'compact', label: 'Compact' },
      { value: 'normal', label: 'Normal' },
      { value: 'roomy', label: 'Roomy' },
    ] },
    blockGap: spaceField('…or exactly this gap between blocks'),
    blockGapLarge: spaceField('…and this one before the payment and footer blocks'),
    bodyFont: fontField,
    headingFont: headingFontField,
  },
  defaultProps: {
    accent: '', labelColour: '', titleColour: '',
    tableHeadBg: '', tableHeadInk: '', panelBg: '', panelInk: '', zebraBg: '',
    ruleWeight: 'thick', ruleWeightPx: '', corners: 'square', cornerRadius: '',
    density: 'normal', blockGap: '', blockGapLarge: '',
    bodyFont: '', headingFont: '',
  },
  render: ShopInvoiceStyle,
}
export const shopInvoiceStylePuckRscComponent = { ...shopInvoiceStylePuckComponent, render: ShopInvoiceStyle }

// ---------------------------------------------------------------------------
// Notice panel
// ---------------------------------------------------------------------------
//
// The sentence a document says before it says any numbers: how to pay, what the
// order was, how long a price holds. Written by the owner with {{PLACEHOLDERS}}
// (see invoice-shared.tsx) so one wording covers every invoice.

const NOTICE_STYLES = [
  { value: 'panel', label: 'Tinted panel with an accent bar' },
  { value: 'outline', label: 'Outlined box' },
  { value: 'plain', label: 'Plain text' },
  { value: 'quiet', label: 'Small print' },
]

type NoticeProps = DocProps & {
  lead?: string; body?: string; panelStyle?: string; hideWhenEmpty?: string
  bodyPt?: number | string; radius?: string; padding?: string
}

export function ShopInvoiceNotice(props: NoticeProps) {
  const ctx = useCtx(props)
  const tokens = invoiceTokens(ctx)
  const font = fontStyle(props)
  const lead = fillTokens(props.lead?.trim() ?? '', tokens)
  const body = fillTokens(props.body?.trim() ?? '', tokens)
  // Everything an owner wrote was tokens, and every token was empty. Printing an
  // empty tinted box would be worse than printing nothing.
  if (!lead && !body && props.hideWhenEmpty !== 'no') return null
  const variant = NOTICE_STYLES.some((s) => s.value === props.panelStyle) ? props.panelStyle : 'panel'
  const paras = paragraphs(body)

  return (
    <>
      <Style />
      <FontLink family={props.fontFamily} />
      <section
        className={`shp-inv-notice shp-inv-notice-${variant}`}
        style={{
          ...font,
          ...sizeVars({ '--shp-inv-notice-size': props.bodyPt }),
          ...(cssLength(props.radius) ? { '--shp-inv-radius': cssLength(props.radius)! } : {}),
          ...(cssLength(props.padding) ? { '--shp-inv-notice-pad': cssLength(props.padding)! } : {}),
        }}
      >
        {/* The lead runs into the first paragraph rather than sitting above it -
            "Payment is due on 6 May. Order ORD-000142, placed 6 April." is one
            sentence with a bold opening, not a heading and a body. */}
        {paras.length > 0 ? (
          paras.map((para, i) => (
            <p key={i}>
              {i === 0 && lead && <span className="shp-inv-notice-lead">{lead} </span>}
              {para}
            </p>
          ))
        ) : (
          lead && <p><span className="shp-inv-notice-lead">{lead}</span></p>
        )}
      </section>
    </>
  )
}

export const shopInvoiceNoticePuckComponent = {
  label: 'Document: Notice panel',
  fields: {
    lead: { type: 'text' as const, label: 'Opening words, in bold' },
    body: { type: 'textarea' as const, label: `The rest of it. ${TOKEN_HINT}` },
    panelStyle: { type: 'select' as const, label: 'Look', options: NOTICE_STYLES },
    hideWhenEmpty: { type: 'select' as const, label: 'When there is nothing to say', options: [
      { value: 'yes', label: 'Leave it off the page' },
      { value: 'no', label: 'Print the empty panel' },
    ] },
    fontFamily: fontField,
    bodyPt: sizeField('Text size'),
    radius: radiusField('Corners'),
    padding: spaceField('Space inside the panel'),
  },
  defaultProps: {
    lead: 'Payment is due by {{DUE_DATE}}.',
    body: 'Order {{ORDER_NUMBER}}, invoiced {{INVOICE_DATE}}. Please quote the invoice number on any payment or query.',
    panelStyle: 'panel', hideWhenEmpty: 'yes', fontFamily: '', radius: '', padding: '',
  },
  render: ShopInvoiceNotice,
}
export const shopInvoiceNoticePuckRscComponent = { ...shopInvoiceNoticePuckComponent, render: ShopInvoiceNotice }

// ---------------------------------------------------------------------------
// Footer
// ---------------------------------------------------------------------------
//
// The line at the bottom of a company's paperwork: where to find them, and the
// registration details a limited company has to print. Separate from the Payment
// block's own footer line, which stays exactly as it was so that a published
// layout keeps working - this is the richer one, and a layout using it turns
// that one off.

type FooterProps = DocProps & {
  contact?: string; smallPrint?: string; align?: string; rule?: string
  contactPt?: number | string; smallPrintPt?: number | string
}

export function ShopInvoiceFooter(props: FooterProps) {
  const ctx = useCtx(props)
  const tokens = invoiceTokens(ctx)
  const font = fontStyle(props)
  const contact = fillTokens(props.contact?.trim() ?? '', tokens)
  const small = fillTokens(props.smallPrint?.trim() ?? '', tokens)
  if (!contact && !small) return null
  const align = props.align === 'left' || props.align === 'right' ? ` shp-inv-align-${props.align}` : ''
  const bare = props.rule === 'no' ? ' shp-inv-footer-bare' : ''

  return (
    <>
      <Style />
      <FontLink family={props.fontFamily} />
      <footer
        className={`shp-inv-footer${align}${bare}`}
        style={{
          ...font,
          ...sizeVars({
            '--shp-inv-footer-contact-size': props.contactPt,
            '--shp-inv-footer-small-size': props.smallPrintPt,
          }),
        }}
      >
        {contact && <p className="shp-inv-contact">{contact}</p>}
        {/* Single newlines, not blank lines: registration small print is a run of
            short lines that belong to one another, not separate paragraphs. */}
        {small && (
          <p className="shp-inv-small">
            {small.split('\n').map((line, i, all) => (
              <span key={i}>
                {line}
                {i < all.length - 1 && <br />}
              </span>
            ))}
          </p>
        )}
      </footer>
    </>
  )
}

export const shopInvoiceFooterPuckComponent = {
  label: 'Document: Footer',
  fields: {
    contact: { type: 'text' as const, label: 'Contact line, in bold' },
    smallPrint: { type: 'textarea' as const, label: `Small print, one line each. ${TOKEN_HINT}` },
    align: { type: 'select' as const, label: 'Sits', options: [
      { value: 'center', label: 'Centred' },
      { value: 'left', label: 'Left' },
      { value: 'right', label: 'Right' },
    ] },
    rule: { type: 'select' as const, label: 'Rule above it', options: yesNo },
    fontFamily: fontField,
    contactPt: sizeField('Contact line size'),
    smallPrintPt: sizeField('Small print size'),
  },
  defaultProps: {
    contact: '{{SITE_URL}} · {{BUSINESS_EMAIL}}',
    smallPrint: '{{BUSINESS_NAME}}, company number {{COMPANY_NUMBER}}. VAT number {{VAT_NUMBER}}.\nRegistered office: {{BUSINESS_ADDRESS}}.',
    align: 'center', rule: 'yes', fontFamily: '',
  },
  render: ShopInvoiceFooter,
}
export const shopInvoiceFooterPuckRscComponent = { ...shopInvoiceFooterPuckComponent, render: ShopInvoiceFooter }

// ---------------------------------------------------------------------------
// Divider
// ---------------------------------------------------------------------------
//
// A rule with nothing else to it, for the gaps the blocks around it do not rule
// themselves - under the heading of a document whose heading block is flat, or
// above a footer that is not the last thing on the page.

const SPACES: Record<string, string> = {
  none: '0',
  small: '0.75rem',
  medium: '1.5rem',
  large: '2.5rem',
}

type DividerProps = {
  weight?: string; weightPx?: string; colour?: string; width?: string
  spaceAbove?: string; spaceBelow?: string; spaceAbovePx?: string; spaceBelowPx?: string
}

export function ShopInvoiceDivider(props: DividerProps) {
  const width = props.width === 'short' || props.width === 'centre' ? ` shp-inv-rule-${props.width}` : ''
  const colour = props.colour?.trim()
  return (
    <>
      <Style />
      <hr
        className={`shp-inv-rule${width}`}
        style={{
          borderTopWidth: cssLength(props.weightPx) ?? RULE_WEIGHTS[props.weight ?? 'hairline'] ?? '1px',
          marginTop: cssLength(props.spaceAbovePx) ?? SPACES[props.spaceAbove ?? 'medium'] ?? SPACES.medium,
          marginBottom: cssLength(props.spaceBelowPx) ?? SPACES[props.spaceBelow ?? 'medium'] ?? SPACES.medium,
          // The colour goes on the custom property the stylesheet reads, NOT on
          // border-top-color. The print rules have to say !important to force a
          // dark-mode page back to ink on paper, and !important beats an inline
          // declaration - so a coloured rule set inline came out grey in the PDF,
          // which is the one place the colour was the whole point. Set as a
          // property, both the screen rule and the print rule pick it up.
          // Omitted entirely when blank, so the token fallback stands.
          ...(colour ? { '--shp-inv-rule-ink': colour } : {}),
        } as CSSProperties}
      />
    </>
  )
}

export const shopInvoiceDividerPuckComponent = {
  label: 'Document: Divider',
  fields: {
    weight: { type: 'select' as const, label: 'Thickness', options: [
      { value: 'hairline', label: 'Hairline' },
      { value: 'medium', label: 'Medium' },
      { value: 'thick', label: 'Thick' },
      { value: 'heavy', label: 'Heavy' },
    ] },
    weightPx: spaceField('…or exactly this thick'),
    colour: colourField('Colour (blank uses the document border)'),
    width: { type: 'select' as const, label: 'Width', options: [
      { value: 'full', label: 'Right across' },
      { value: 'short', label: 'Short, at the left' },
      { value: 'centre', label: 'Short, centred' },
    ] },
    spaceAbove: { type: 'select' as const, label: 'Space above', options: [
      { value: 'none', label: 'None' },
      { value: 'small', label: 'Small' },
      { value: 'medium', label: 'Medium' },
      { value: 'large', label: 'Large' },
    ] },
    spaceAbovePx: spaceField('…or exactly this much above'),
    spaceBelow: { type: 'select' as const, label: 'Space below', options: [
      { value: 'none', label: 'None' },
      { value: 'small', label: 'Small' },
      { value: 'medium', label: 'Medium' },
      { value: 'large', label: 'Large' },
    ] },
    spaceBelowPx: spaceField('…or exactly this much below'),
  },
  defaultProps: {
    weight: 'hairline', weightPx: '', colour: '', width: 'full',
    spaceAbove: 'medium', spaceAbovePx: '', spaceBelow: 'medium', spaceBelowPx: '',
  },
  render: ShopInvoiceDivider,
}
export const shopInvoiceDividerPuckRscComponent = { ...shopInvoiceDividerPuckComponent, render: ShopInvoiceDivider }

// ---------------------------------------------------------------------------
// Page number
// ---------------------------------------------------------------------------
//
// "Page 2 of 3", for the running footer that repeats at the foot of every page
// of the PDF (see lib/doc-page-settings.tsx and lib/invoice-pdf.ts).
//
// It works by a trick of the printing browser rather than by anything this
// module counts. Chrome fills in the text of any element carrying the classes
// `pageNumber` and `totalPages` when it draws a running header or footer, so the
// block emits two empty spans and lets the browser do the arithmetic - which is
// the only place the arithmetic can be done, since nothing on the server knows
// how many pages a document turned into until it has been printed.
//
// Anywhere else - on the document itself, on the screen - those spans stay
// empty, which is why the block is offered on the Document Footer layout and not
// on the document ones. {{PAGE}} and {{PAGES}} are the two placeholders; the
// ordinary invoice ones (see invoice-shared.tsx) work here too, so a footer can
// read "Invoice INV-000087 - page 2 of 3".

type PageNumberProps = DocProps & {
  text?: string; align?: string; sizePt?: number | string; colour?: string
}

const PAGE_TOKEN_RE = /(\{\{\s*(?:PAGE|PAGES)\s*\}\})/

export function ShopInvoicePageNumber(props: PageNumberProps) {
  const ctx = useCtx(props)
  const font = fontStyle(props)
  // The invoice's own placeholders first, then the two the browser fills in -
  // in that order, so an owner writing {{INVOICE_NUMBER}} beside {{PAGE}} gets
  // the number filled in here and the page left for Chrome.
  const text = fillTokens(props.text?.trim() || 'Page {{PAGE}} of {{PAGES}}', invoiceTokens(ctx))
  const align = props.align === 'left' || props.align === 'right' ? props.align : 'center'
  const colour = props.colour?.trim()
  if (!text) return null

  return (
    <>
      <Style />
      <FontLink family={props.fontFamily} />
      <p
        className="shp-inv-pageno"
        style={{
          ...font,
          textAlign: align,
          ...sizeVars({ '--shp-inv-pageno-size': props.sizePt }),
          ...(colour ? { '--shp-inv-pageno-ink': colour } : {}),
        } as CSSProperties}
      >
        {text.split(PAGE_TOKEN_RE).map((part, i) => {
          if (/^\{\{\s*PAGE\s*\}\}$/.test(part)) return <span className="pageNumber" key={i} />
          if (/^\{\{\s*PAGES\s*\}\}$/.test(part)) return <span className="totalPages" key={i} />
          return <span key={i}>{part}</span>
        })}
      </p>
    </>
  )
}

export const shopInvoicePageNumberPuckComponent = {
  label: 'Document: Page number',
  fields: {
    text: { type: 'text' as const, label: `Reads. {{PAGE}} and {{PAGES}} are filled in by the printer. ${TOKEN_HINT}` },
    align: { type: 'select' as const, label: 'Sits', options: [
      { value: 'center', label: 'Centred' },
      { value: 'left', label: 'Left' },
      { value: 'right', label: 'Right' },
    ] },
    fontFamily: fontField,
    sizePt: sizeField('Size'),
    colour: colourField('Colour'),
  },
  defaultProps: { text: 'Page {{PAGE}} of {{PAGES}}', align: 'center', fontFamily: '', colour: '' },
  render: ShopInvoicePageNumber,
}
export const shopInvoicePageNumberPuckRscComponent = { ...shopInvoicePageNumberPuckComponent, render: ShopInvoicePageNumber }
