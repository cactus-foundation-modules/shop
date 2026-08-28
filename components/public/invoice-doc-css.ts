// Styling for the invoice document, in one place because two surfaces render
// the same markup: the invoice page a customer or an admin opens, and the PDF -
// which is a headless browser printing that same page.
//
// Colours are semantic tokens, never hex, so the document sits inside the site's
// own theme in light and dark alike - with one exception, marked below: the
// print rules force ink on paper, because a dark-mode PDF is a sheet of black
// toner and a customer's printer is not a party to that decision.
//
// Typefaces bind to the same variables Appearance > Styles emits, so the
// document inherits the site's fonts wherever it is rendered. A block whose own
// Font field is set overrides these inline, which is why they are plain class
// rules and not !important.
//
// ---------------------------------------------------------------------------
// The `--shp-inv-*` custom properties
// ---------------------------------------------------------------------------
//
// Every rule below that an owner can influence reads a `--shp-inv-*` property
// with a fallback, and every one of those fallbacks is exactly what the document
// looked like before the Document style block existed. So a layout that carries
// no style block is byte-identical to the old one, and one that does gets its
// accent colour, its table fill and its spacing from a single place rather than
// from the same field repeated on six blocks.
//
// The style block sets them on the part classes themselves (see DOC_SCOPE in
// invoice-chrome.tsx) rather than on :root, so nothing escapes the document -
// which matters in the Puck editor, where the canvas shares a document with the
// admin UI.
export const INVOICE_DOC_CSS = `
.shp-inv-head, .shp-inv-intro, .shp-inv-parties, .shp-inv-lines, .shp-inv-totals,
.shp-inv-vat, .shp-inv-pay, .shp-inv-foot, .shp-inv-notice, .shp-inv-footer,
.shp-inv-rule, .shp-inv-lead { font-family: var(--shp-inv-body-font, var(--font-body, var(--font-sans, inherit))); }
.shp-inv-h1 { font-family: var(--shp-inv-head-font, var(--h1-family, var(--font-heading, var(--font-body, inherit)))); font-weight: var(--h1-weight, 700); letter-spacing: var(--h1-letter-spacing, normal); text-transform: var(--h1-transform, none); }
.shp-inv-h2 { font-family: var(--shp-inv-head-font, var(--h2-family, var(--font-heading, var(--font-body, inherit)))); font-weight: var(--h2-weight, 700); letter-spacing: var(--h2-letter-spacing, normal); text-transform: var(--h2-transform, none); }

/* Leading, stated by the document rather than inherited from the page it is
   sitting on.

   A site's body typography is written for a web page, and Appearance > Styles
   lets an owner set it as an exact line height in PIXELS - "16px text, 24px
   leading", which is how a type scale is normally written. A px line-height is
   inherited as a LENGTH, so it arrives unchanged on a run of text an owner has
   set to 11px here, and the document prints with two lines of air between every
   address line. The small headings are worse: 'main h2' carries the site's own
   h2 leading (36px, under a 13px label) and an INHERITED value cannot beat a
   rule that matches, so the parts had to say it themselves.

   Unitless on purpose. That is the whole fix: every size field on every block
   now gets leading in proportion to the size an owner picked, on screen and on
   paper alike. --shp-inv-leading is the Document style block's Line spacing
   field; the fallbacks below are what each part reads best at, and the parts
   that want a little more air (the notice, the small print) keep it. */
.shp-inv-head, .shp-inv-intro, .shp-inv-lead, .shp-inv-parties, .shp-inv-lines,
.shp-inv-totals, .shp-inv-paid, .shp-inv-vat, .shp-inv-pay, .shp-inv-foot,
.shp-inv-notice, .shp-inv-footer, .shp-inv-rule, .shp-inv-pageno,
.shp-inv-h1, .shp-inv-h2 { line-height: var(--shp-inv-leading, 1.4); }

.shp-inv-head { display: flex; flex-wrap: wrap; gap: 1.5rem; justify-content: space-between; align-items: flex-start; padding-bottom: 1rem; border-bottom: 1px solid var(--color-border); }
/* The rule under the heading, as three looks rather than three fields. A hairline
   is what it has always been; the accent is the document's own colour at the
   document's own weight; flat drops it for a heading that leads straight into a
   notice panel. */
.shp-inv-head.shp-inv-head-accent { padding-bottom: 1.25rem; border-bottom: var(--shp-inv-rule-w, 3px) solid var(--shp-inv-accent, var(--color-border)); }
.shp-inv-head.shp-inv-head-flat { padding-bottom: 0.5rem; border-bottom: 0; }
/* Which side the heading sits on. The letterhead is a Site Logo block of its
   own now, so this only moves the heading and its dates - but it stays a class
   on the same markup, so the RSC path and the editor cannot disagree, and a
   layout saved when this also flipped a logo keeps the side it was set to. */
.shp-inv-head.shp-inv-swap { flex-direction: row-reverse; }
.shp-inv-head.shp-inv-swap .shp-inv-meta { text-align: left; margin-left: 0; margin-right: auto; }
.shp-inv-head.shp-inv-swap .shp-inv-facts { justify-content: start; }
.shp-inv-meta { text-align: right; margin-left: auto; }
.shp-inv-h1 { font-size: var(--shp-inv-title-size, 1.5rem); line-height: 1.1; margin: 0 0 0.5rem; color: var(--shp-inv-title-ink, var(--color-text)); }
.shp-inv-h1.shp-inv-title-sm { font-size: var(--shp-inv-title-size, 1.25rem); }
.shp-inv-h1.shp-inv-title-lg { font-size: var(--shp-inv-title-size, 2rem); }
.shp-inv-h1.shp-inv-title-xl { font-size: var(--shp-inv-title-size, 2.75rem); }
.shp-inv-h2 { font-size: var(--shp-inv-h2-size, 0.8125rem); margin: 0 0 0.375rem; color: var(--shp-inv-label, var(--color-text-muted)); text-transform: uppercase; letter-spacing: 0.04em; }
.shp-inv-facts { display: grid; grid-template-columns: auto auto; gap: 0.125rem 0.75rem; margin: 0; font-size: var(--shp-inv-facts-size, 0.875rem); justify-content: end; }
/* Each label-and-value pair is wrapped, so a row can be dropped whole rather
   than as two loose children of the grid - which is what left a gap on the page
   when a document had no due date. display: contents keeps the pair as two grid
   cells, exactly as it was when they were direct children. */
.shp-inv-facts .shp-inv-fact { display: contents; }
.shp-inv-facts dt { color: var(--color-text-muted); }
.shp-inv-facts dd { margin: 0; color: var(--color-text); font-variant-numeric: tabular-nums; }
/* Stacked facts read "Issued 6 April 2026" on one line instead of ruling the
   labels and the values into two columns. Same <dl>, same source order: the
   grid collapses to one column and each pair is laid inline. */
.shp-inv-facts.shp-inv-facts-stack { display: block; text-align: right; line-height: var(--shp-inv-leading, 1.5); }
/* The wrapper is the line here, so each pair breaks after itself. It used to be
   an empty ::after block on every <dd>, which put one blank line under the last
   row of every stacked heading - the last thing anybody looks for when an
   invoice comes out with a gap in it. */
.shp-inv-facts.shp-inv-facts-stack .shp-inv-fact { display: block; }
.shp-inv-facts.shp-inv-facts-stack dt { display: inline; }
.shp-inv-facts.shp-inv-facts-stack dd { display: inline; }
/* The space between a label and its value. A text node between <dt> and <dd> is
   not something a <dl> may hold, so the gap is drawn rather than typed -
   white-space: pre stops it collapsing to nothing. */
.shp-inv-facts.shp-inv-facts-stack dt::after { content: ' '; white-space: pre; }
/* The number the document is filed under, printed above the dates at its own
   weight and with no label - an invoice number needs no introduction, and the
   dates under it are supporting detail. Its own element rather than a row of the
   list, because a <dd> with nothing before it is not a description list. */
.shp-inv-lead { margin: 0 0 0.375rem; font-weight: 700; font-size: var(--shp-inv-lead-size, 1rem); color: var(--shp-inv-title-ink, var(--color-text)); font-variant-numeric: tabular-nums; }
.shp-inv-void { display: inline-block; margin-top: 0.5rem; padding: 0.125rem 0.5rem; border: 1px solid var(--color-error, var(--color-border)); border-radius: var(--radius-sm, 4px); color: var(--color-error, var(--color-text)); font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.08em; }
.shp-inv-intro { margin: 1rem 0 0; font-size: var(--shp-inv-intro-size, inherit); color: var(--color-text); }

/* min(100%, 220px), not a bare 220px: an invoice read on a phone stacks its
   parties rather than widening the document past the screen. */
.shp-inv-parties { margin: var(--shp-inv-gap, 1.5rem) 0 0; display: grid; gap: 1.5rem; grid-template-columns: repeat(auto-fit, minmax(min(100%, 220px), 1fr)); }
/* A definite column count, for a document whose two addresses should sit at the
   same two places on every invoice rather than reflowing with their length. */
.shp-inv-parties.shp-inv-cols-2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.shp-inv-parties.shp-inv-cols-3 { grid-template-columns: repeat(3, minmax(0, 1fr)); }
/* A single party on its own - the "From" and "To" blocks, which are one column
   each and must not be stretched across a grid of one. */
.shp-inv-parties.shp-inv-party-one { display: block; }
.shp-inv-parties.shp-inv-party-centre { text-align: center; }
.shp-inv-parties.shp-inv-party-right { text-align: right; }
.shp-inv-parties.shp-inv-party-centre address, .shp-inv-parties.shp-inv-party-right address { justify-items: inherit; }
.shp-inv-party address { font-style: normal; display: grid; gap: 0.125rem; color: var(--color-text); font-size: var(--shp-inv-party-size, 0.9375rem); }
.shp-inv-party .shp-inv-strong { font-weight: 600; }
.shp-inv-reg { margin: 0.5rem 0 0; display: grid; gap: 0.125rem; font-size: var(--shp-inv-reg-size, 0.8125rem); color: var(--color-text-muted); }

/* 'font-size: inherit' on the cells is load-bearing, not tidying. globals.css
   styles bare 'td' for the site's own tables, font size included, and an element
   selector beats a size INHERITED from the table above it - so the Items block's
   row size moved the <table> and every cell on the page carried on at the site's
   table size. It looked exactly like a field that did nothing. */
.shp-inv-lines { width: 100%; border-collapse: collapse; margin: var(--shp-inv-gap, 1.5rem) 0 0; font-size: var(--shp-inv-row-size, 0.9375rem); }
.shp-inv-lines th { background: transparent; text-align: left; padding: 0.5rem 0.5rem 0.5rem 0; border-bottom: 1px solid var(--color-border); color: var(--shp-inv-thead-ink, var(--color-text-muted)); font-weight: 600; font-size: var(--shp-inv-thead-size, 0.8125rem); text-transform: uppercase; letter-spacing: 0.02em; }
.shp-inv-lines td { padding: var(--shp-inv-row-y, 0.625rem) 0.5rem var(--shp-inv-row-y, 0.625rem) 0; border-bottom: 1px solid var(--color-border-subtle, var(--color-border)); vertical-align: top; color: var(--color-text); font-size: inherit; }
.shp-inv-lines th:last-child, .shp-inv-lines td:last-child { padding-right: 0; }
/* A banded head. The fill needs padding inside the cells to sit in, which the
   ruled head does not, so the whole treatment is one class rather than a colour
   swapped underneath. print-color-adjust keeps it in the PDF: a browser drops
   backgrounds when it prints unless told the fill is the point. */
.shp-inv-lines.shp-inv-thead-fill th { background: var(--shp-inv-thead-bg, var(--color-bg-subtle)); padding: var(--shp-inv-thead-pad-y, 0.625rem) var(--shp-inv-thead-pad-x, 0.75rem); border-bottom: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
/* The band's own corners. --shp-inv-thead-radius is the Items block's own field
   and falls back to the document style block's --shp-inv-radius, so a layout
   that set corners once still gets them and one that wants a different radius
   on this table alone can have it. */
.shp-inv-lines.shp-inv-thead-fill th:first-child { padding-left: var(--shp-inv-thead-pad-x, 0.75rem); border-radius: var(--shp-inv-thead-radius, var(--shp-inv-radius, 0)) 0 0 var(--shp-inv-thead-radius, var(--shp-inv-radius, 0)); }
.shp-inv-lines.shp-inv-thead-fill th:last-child { padding-right: var(--shp-inv-thead-pad-x, 0.75rem); border-radius: 0 var(--shp-inv-thead-radius, var(--shp-inv-radius, 0)) var(--shp-inv-thead-radius, var(--shp-inv-radius, 0)) 0; }
/* Every cell rounded, for a banded head an owner wants read as separate chips
   rather than as one bar. */
.shp-inv-lines.shp-inv-thead-fill.shp-inv-thead-round-all th { border-radius: var(--shp-inv-thead-radius, var(--shp-inv-radius, 0)); }
.shp-inv-lines.shp-inv-thead-fill td:first-child { padding-left: var(--shp-inv-thead-pad-x, 0.75rem); }
.shp-inv-lines.shp-inv-thead-fill td:last-child { padding-right: var(--shp-inv-thead-pad-x, 0.75rem); }
/* Column headings as typed, for a document whose headings are words rather than
   labels ("Description" reads better than "DESCRIPTION" at 14px). */
.shp-inv-lines.shp-inv-thead-plain th { text-transform: none; letter-spacing: normal; }
/* Rounded shading on the alternate rows, which only means anything with the
   shading switched on. */
.shp-inv-lines.shp-inv-zebra tbody tr td:first-child { border-radius: var(--shp-inv-row-radius, 0) 0 0 var(--shp-inv-row-radius, 0); }
.shp-inv-lines.shp-inv-zebra tbody tr td:last-child { border-radius: 0 var(--shp-inv-row-radius, 0) var(--shp-inv-row-radius, 0) 0; }
/* Banding every other row, for a long list somebody has to read across. */
.shp-inv-lines.shp-inv-zebra tbody tr:nth-child(even) td { background: var(--shp-inv-zebra-bg, var(--color-bg-subtle)); -webkit-print-color-adjust: exact; print-color-adjust: exact; }
/* Rules dropped from between the rows, keeping only the one that closes the
   table. Suits a short invoice with a banded head, where a rule under every
   line is one line too many. */
.shp-inv-lines.shp-inv-rows-none td { border-bottom: 0; }
.shp-inv-lines.shp-inv-rows-none tbody tr:last-child td { border-bottom: 1px solid var(--color-border); }
/* Three of the site's own table rules reach into the document and beat what the
   rules above say, because a bare element selector still outranks a value that
   was merely INHERITED, and app/globals.css styles tables for the site's own
   content:

    - 'tr:last-child td { border-bottom: none }' outranks '.shp-inv-lines td'
      (two elements and a pseudo-class against one class and an element), so the
      rule that closes the table never printed at all.
    - bare 'th' carries the site's subtle fill, and nothing above says anything
      about a heading's background, so a head set to "Ruled underneath" came out
      on a grey band anyway.
    - 'tbody tr:hover' lit the rows up under the pointer on the document page. A
      printed document is not a data table somebody is picking a row out of.

   Each is answered at the specificity it takes to win and no more, so the items
   block's own filled band, its zebra shading and its "rules under the last row
   only" all still outrank these. */
.shp-inv-lines tbody tr:last-child td { border-bottom: 1px solid var(--color-border-subtle, var(--color-border)); }
.shp-inv-lines tbody tr:hover { background: transparent; }
.shp-inv-vat tbody tr:last-child td { border-bottom: 1px solid var(--color-border-subtle, var(--color-border)); }
.shp-inv-vat tbody tr:hover { background: transparent; }
.shp-inv-num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
.shp-inv-name { display: block; font-weight: 500; }
.shp-inv-sku { display: block; font-size: var(--shp-inv-sku-size, 0.8125rem); color: var(--color-text-muted); }
.shp-inv-detail { list-style: none; margin: 0.25rem 0 0; padding: 0; display: grid; gap: 0.125rem; font-size: var(--shp-inv-detail-size, 0.8125rem); color: var(--color-text-muted); }
.shp-inv-detail span { font-weight: 500; }
.shp-inv-empty { color: var(--color-text-muted); padding: 1.25rem 0; }

.shp-inv-totals { display: grid; grid-template-columns: 1fr auto; gap: 0.25rem 1.5rem; margin: 1.25rem 0 0; margin-left: auto; max-width: 22rem; font-size: var(--shp-inv-totals-size, 0.9375rem); }
/* The figures at the left instead of pushed to the right margin. */
.shp-inv-totals.shp-inv-totals-left { margin-left: 0; margin-right: auto; }
.shp-inv-totals dt { color: var(--color-text-muted); }
.shp-inv-totals dd { margin: 0; text-align: right; color: var(--color-text); font-variant-numeric: tabular-nums; }
.shp-inv-row { display: contents; }
.shp-inv-grand { font-weight: 700; font-size: var(--shp-inv-grand-size, 1.0625rem); color: var(--color-text); padding-top: 0.375rem; border-top: 1px solid var(--color-border); }
/* The total given the weight of a total: a rule in the document's accent above
   it, and the heading face at a size that ends the page.
   The rule is drawn on the label and on the figure, so the column gap would
   otherwise break it in two with a notch in the middle. The gap moves into the
   figure's own padding instead: same spacing, one continuous rule. */
.shp-inv-totals.shp-inv-total-accent { column-gap: 0; }
.shp-inv-totals.shp-inv-total-accent dd { padding-left: 1.5rem; }
.shp-inv-totals.shp-inv-total-accent .shp-inv-grand { font-family: var(--shp-inv-head-font, var(--h1-family, var(--font-heading, var(--font-body, inherit)))); font-size: var(--shp-inv-grand-size, 1.5rem); padding-top: 0.75rem; margin-top: 0.375rem; border-top: var(--shp-inv-rule-w, 2px) solid var(--shp-inv-accent, var(--color-border)); color: var(--shp-inv-title-ink, var(--color-text)); }
.shp-inv-paid { margin: 0.625rem 0 0; text-align: right; font-size: var(--shp-inv-paid-size, 0.8125rem); color: var(--color-text-muted); }

.shp-inv-vat { margin: var(--shp-inv-gap, 1.5rem) 0 0; }
.shp-inv-vat table { width: 100%; border-collapse: collapse; font-size: var(--shp-inv-vat-size, 0.875rem); max-width: 30rem; margin-left: auto; }
.shp-inv-vat th { background: transparent; text-align: right; padding: 0.375rem 0.5rem 0.375rem 0; border-bottom: 1px solid var(--color-border); color: var(--shp-inv-thead-ink, var(--color-text-muted)); font-weight: 600; font-size: var(--shp-inv-vat-head-size, 0.75rem); text-transform: uppercase; letter-spacing: 0.02em; }
.shp-inv-vat th:first-child { text-align: left; }
.shp-inv-vat td { padding: 0.375rem 0.5rem 0.375rem 0; border-bottom: 1px solid var(--color-border-subtle, var(--color-border)); color: var(--color-text); text-align: right; font-variant-numeric: tabular-nums; font-size: inherit; }
.shp-inv-vat td:first-child { text-align: left; }
.shp-inv-vat th:last-child, .shp-inv-vat td:last-child { padding-right: 0; }
/* The same banded head as the item table, on the smaller table. Its own rule
   because the fill needs padding inside the cells, and the item table's rule is
   scoped to the item table so it cannot reach here. */
.shp-inv-vat table.shp-inv-thead-fill th { background: var(--shp-inv-thead-bg, var(--color-bg-subtle)); padding: 0.5rem 0.625rem; border-bottom: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.shp-inv-vat table.shp-inv-thead-fill th:first-child { border-radius: var(--shp-inv-thead-radius, var(--shp-inv-radius, 0)) 0 0 var(--shp-inv-thead-radius, var(--shp-inv-radius, 0)); }
.shp-inv-vat table.shp-inv-thead-fill th:last-child { padding-right: 0.625rem; border-radius: 0 var(--shp-inv-thead-radius, var(--shp-inv-radius, 0)) var(--shp-inv-thead-radius, var(--shp-inv-radius, 0)) 0; }
.shp-inv-vat table.shp-inv-thead-fill td:first-child { padding-left: 0.625rem; }
.shp-inv-vat table.shp-inv-thead-fill td:last-child { padding-right: 0.625rem; }

.shp-inv-pay { margin: var(--shp-inv-gap-lg, 1.75rem) 0 0; display: grid; gap: 0.75rem; }
/* Payment and terms side by side, which is where they sit on most printed
   invoices - and where two short blocks stop pushing the footer down a page. */
.shp-inv-pay.shp-inv-cols-2 { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1.5rem; }
.shp-inv-pay p { margin: 0; font-size: var(--shp-inv-pay-size, 0.875rem); color: var(--color-text-muted); }
.shp-inv-pay .shp-inv-block p { margin: 0 0 0.375rem; }
.shp-inv-foot { margin: var(--shp-inv-gap, 1.5rem) 0 0; padding-top: 0.75rem; border-top: 1px solid var(--color-border); font-size: var(--shp-inv-foot-size, 0.8125rem); color: var(--color-text-muted); }

/* ---------------------------------------------------------------------------
   Notice panel - a sentence the document needs said before the figures: how to
   pay, what the order was, how long a price holds.
   --------------------------------------------------------------------------- */
.shp-inv-notice { margin: var(--shp-inv-gap, 1.5rem) 0 0; font-size: var(--shp-inv-notice-size, 0.9375rem); line-height: var(--shp-inv-leading, 1.55); color: var(--shp-inv-panel-ink, var(--color-text)); }
.shp-inv-notice p { margin: 0 0 0.5rem; }
.shp-inv-notice p:last-child { margin-bottom: 0; }
.shp-inv-notice .shp-inv-notice-lead { font-weight: 700; }
.shp-inv-notice.shp-inv-notice-panel { padding: var(--shp-inv-notice-pad, 0.875rem) calc(var(--shp-inv-notice-pad, 0.875rem) * 1.3); background: var(--shp-inv-panel-bg, var(--color-bg-subtle)); border-left: var(--shp-inv-rule-w, 3px) solid var(--shp-inv-accent, var(--color-border)); border-radius: 0 var(--shp-inv-radius, 0) var(--shp-inv-radius, 0) 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.shp-inv-notice.shp-inv-notice-outline { padding: var(--shp-inv-notice-pad, 0.875rem) calc(var(--shp-inv-notice-pad, 0.875rem) * 1.3); border: 1px solid var(--shp-inv-accent, var(--color-border)); border-radius: var(--shp-inv-radius, 0); }
.shp-inv-notice.shp-inv-notice-quiet { padding: 0; color: var(--color-text-muted); font-size: var(--shp-inv-notice-size, 0.875rem); }

/* ---------------------------------------------------------------------------
   Footer - the line at the bottom of every page of paperwork a company sends:
   where to find them, and the registration details the law wants on it.
   --------------------------------------------------------------------------- */
.shp-inv-footer { margin: var(--shp-inv-gap-lg, 1.75rem) 0 0; padding-top: 1rem; border-top: 1px solid var(--color-border); text-align: center; }
.shp-inv-footer.shp-inv-footer-bare { border-top: 0; padding-top: 0; }
.shp-inv-footer.shp-inv-align-left { text-align: left; }
.shp-inv-footer.shp-inv-align-right { text-align: right; }
.shp-inv-footer .shp-inv-contact { margin: 0 0 0.5rem; font-size: var(--shp-inv-footer-contact-size, 0.875rem); font-weight: 700; color: var(--shp-inv-accent, var(--color-text)); }
.shp-inv-footer .shp-inv-small { margin: 0; font-size: var(--shp-inv-footer-small-size, 0.75rem); line-height: var(--shp-inv-leading, 1.6); color: var(--color-text-muted); }

/* ---------------------------------------------------------------------------
   Page number - "Page 2 of 3" in the running footer. The two spans are empty
   until the printing browser fills them in, so this only ever says anything on
   a PDF.
   --------------------------------------------------------------------------- */
.shp-inv-pageno { margin: 0; font-size: var(--shp-inv-pageno-size, 0.75rem); color: var(--shp-inv-pageno-ink, var(--color-text-muted)); }

/* ---------------------------------------------------------------------------
   Divider - a rule of its own, for the gaps between sections the blocks above
   do not rule themselves.
   --------------------------------------------------------------------------- */
.shp-inv-rule { border: 0; border-top: var(--shp-inv-rule-h, 1px) solid var(--shp-inv-rule-ink, var(--color-border)); }
.shp-inv-rule.shp-inv-rule-short { max-width: 6rem; margin-right: auto; }
.shp-inv-rule.shp-inv-rule-centre { max-width: 6rem; margin-left: auto; margin-right: auto; }

@media (max-width: 560px) {
  .shp-inv-meta, .shp-inv-head.shp-inv-swap .shp-inv-meta { text-align: left; margin-left: 0; }
  .shp-inv-facts, .shp-inv-head.shp-inv-swap .shp-inv-facts { justify-content: start; }
  .shp-inv-facts.shp-inv-facts-stack { text-align: left; }
  .shp-inv-totals { max-width: none; }
  .shp-inv-vat table { max-width: none; }
  .shp-inv-parties.shp-inv-cols-2, .shp-inv-parties.shp-inv-cols-3, .shp-inv-pay.shp-inv-cols-2 { grid-template-columns: minmax(0, 1fr); }
}

/* Print and PDF. The renderer opens the invoice page in a headless browser and
   prints it, so these rules are what the PDF actually looks like. The token
   colours are overridden outright: a viewer in dark mode would otherwise be
   handed a black page, and an invoice is a document people genuinely still
   print.

   Anything an owner can colour is forced through its own custom property with
   the old print colour as the fallback, so an untouched document prints exactly
   as it always did while a designed one keeps its accent instead of having it
   flattened to grey. */
@media print {
  .shp-inv-head, .shp-inv-parties, .shp-inv-lines, .shp-inv-totals, .shp-inv-vat, .shp-inv-pay, .shp-inv-foot,
  .shp-inv-notice, .shp-inv-footer { color: #111 !important; }
  .shp-inv-name, .shp-inv-grand, .shp-inv-strong,
  .shp-inv-facts dd, .shp-inv-lines td, .shp-inv-totals dd, .shp-inv-vat td { color: #111 !important; }
  .shp-inv-facts dt, .shp-inv-sku, .shp-inv-detail, .shp-inv-empty, .shp-inv-reg,
  .shp-inv-paid, .shp-inv-pay p, .shp-inv-foot, .shp-inv-totals dt, .shp-inv-lines th, .shp-inv-vat th { color: #444 !important; }
  .shp-inv-h1, .shp-inv-lead, .shp-inv-totals.shp-inv-total-accent .shp-inv-grand { color: var(--shp-inv-title-ink, #111) !important; }
  .shp-inv-h2 { color: var(--shp-inv-label, #444) !important; }
  .shp-inv-lines.shp-inv-thead-fill th, .shp-inv-vat table.shp-inv-thead-fill th { color: var(--shp-inv-thead-ink, #444) !important; background: var(--shp-inv-thead-bg, transparent) !important; }
  .shp-inv-notice { color: var(--shp-inv-panel-ink, #111) !important; }
  .shp-inv-notice.shp-inv-notice-panel { background: var(--shp-inv-panel-bg, transparent) !important; }
  .shp-inv-notice.shp-inv-notice-quiet { color: #444 !important; }
  .shp-inv-footer .shp-inv-contact { color: var(--shp-inv-accent, #111) !important; }
  .shp-inv-footer .shp-inv-small { color: #444 !important; }
  .shp-inv-pageno { color: var(--shp-inv-pageno-ink, #444) !important; }
  .shp-inv-head, .shp-inv-lines th, .shp-inv-lines td, .shp-inv-grand, .shp-inv-vat th, .shp-inv-vat td, .shp-inv-foot,
  .shp-inv-footer { border-color: #ccc !important; }
  .shp-inv-head.shp-inv-head-accent,
  .shp-inv-totals.shp-inv-total-accent .shp-inv-grand,
  .shp-inv-notice.shp-inv-notice-panel, .shp-inv-notice.shp-inv-notice-outline { border-color: var(--shp-inv-accent, #ccc) !important; }
  .shp-inv-rule { border-top-color: var(--shp-inv-rule-ink, #ccc) !important; }
  .shp-inv-lines { page-break-inside: auto; }
  .shp-inv-lines tr { page-break-inside: avoid; page-break-after: auto; }
  .shp-inv-totals, .shp-inv-vat, .shp-inv-pay, .shp-inv-notice, .shp-inv-footer { page-break-inside: avoid; }
}
`
