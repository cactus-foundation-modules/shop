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
export const INVOICE_DOC_CSS = `
.shp-inv-head, .shp-inv-intro, .shp-inv-parties, .shp-inv-lines, .shp-inv-totals,
.shp-inv-vat, .shp-inv-pay, .shp-inv-foot { font-family: var(--font-body, var(--font-sans, inherit)); }
.shp-inv-h1 { font-family: var(--h1-family, var(--font-heading, var(--font-body, inherit))); font-weight: var(--h1-weight, 700); letter-spacing: var(--h1-letter-spacing, normal); text-transform: var(--h1-transform, none); }
.shp-inv-h2 { font-family: var(--h2-family, var(--font-heading, var(--font-body, inherit))); font-weight: var(--h2-weight, 700); letter-spacing: var(--h2-letter-spacing, normal); text-transform: var(--h2-transform, none); }

.shp-inv-head { display: flex; flex-wrap: wrap; gap: 1.5rem; justify-content: space-between; align-items: flex-start; padding-bottom: 1rem; border-bottom: 1px solid var(--color-border); }
.shp-inv-brand { display: flex; align-items: center; gap: 0.75rem; }
/* The height here is definite on purpose. An SVG logo carries a viewBox and no
   width or height of its own, and a picture with no size of its own sizes to
   nothing at all inside a flex item, which is how a perfectly good logo went
   missing from the document and from the PDF with it. Sizing by height and
   letting the width follow is what the site header does too. object-fit keeps
   the shape of anything wider than the box. */
.shp-inv-logo { height: 56px; width: auto; max-width: 220px; object-fit: contain; object-position: left center; }
.shp-inv-site { font-weight: 600; font-size: 1.0625rem; color: var(--color-text); }
.shp-inv-meta { text-align: right; margin-left: auto; }
.shp-inv-h1 { font-size: 1.5rem; margin: 0 0 0.5rem; color: var(--color-text); }
.shp-inv-h2 { font-size: 0.8125rem; margin: 0 0 0.375rem; color: var(--color-text-muted); text-transform: uppercase; letter-spacing: 0.04em; }
.shp-inv-facts { display: grid; grid-template-columns: auto auto; gap: 0.125rem 0.75rem; margin: 0; font-size: 0.875rem; justify-content: end; }
.shp-inv-facts dt { color: var(--color-text-muted); }
.shp-inv-facts dd { margin: 0; color: var(--color-text); font-variant-numeric: tabular-nums; }
.shp-inv-void { display: inline-block; margin-top: 0.5rem; padding: 0.125rem 0.5rem; border: 1px solid var(--color-error, var(--color-border)); border-radius: var(--radius-sm, 4px); color: var(--color-error, var(--color-text)); font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.08em; }
.shp-inv-intro { margin: 1rem 0 0; color: var(--color-text); }

.shp-inv-parties { margin: 1.5rem 0 0; display: grid; gap: 1.5rem; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); }
.shp-inv-party address { font-style: normal; display: grid; gap: 0.125rem; color: var(--color-text); font-size: 0.9375rem; }
.shp-inv-party .shp-inv-strong { font-weight: 600; }
.shp-inv-reg { margin: 0.5rem 0 0; display: grid; gap: 0.125rem; font-size: 0.8125rem; color: var(--color-text-muted); }

.shp-inv-lines { width: 100%; border-collapse: collapse; margin: 1.5rem 0 0; font-size: 0.9375rem; }
.shp-inv-lines th { text-align: left; padding: 0.5rem 0.5rem 0.5rem 0; border-bottom: 1px solid var(--color-border); color: var(--color-text-muted); font-weight: 600; font-size: 0.8125rem; text-transform: uppercase; letter-spacing: 0.02em; }
.shp-inv-lines td { padding: 0.625rem 0.5rem 0.625rem 0; border-bottom: 1px solid var(--color-border-subtle, var(--color-border)); vertical-align: top; color: var(--color-text); }
.shp-inv-lines th:last-child, .shp-inv-lines td:last-child { padding-right: 0; }
.shp-inv-num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
.shp-inv-name { display: block; font-weight: 500; }
.shp-inv-sku { display: block; font-size: 0.8125rem; color: var(--color-text-muted); }
.shp-inv-detail { list-style: none; margin: 0.25rem 0 0; padding: 0; display: grid; gap: 0.125rem; font-size: 0.8125rem; color: var(--color-text-muted); }
.shp-inv-detail span { font-weight: 500; }
.shp-inv-empty { color: var(--color-text-muted); padding: 1.25rem 0; }

.shp-inv-totals { display: grid; grid-template-columns: 1fr auto; gap: 0.25rem 1.5rem; margin: 1.25rem 0 0; margin-left: auto; max-width: 22rem; font-size: 0.9375rem; }
.shp-inv-totals dt { color: var(--color-text-muted); }
.shp-inv-totals dd { margin: 0; text-align: right; color: var(--color-text); font-variant-numeric: tabular-nums; }
.shp-inv-row { display: contents; }
.shp-inv-grand { font-weight: 700; font-size: 1.0625rem; color: var(--color-text); padding-top: 0.375rem; border-top: 1px solid var(--color-border); }
.shp-inv-paid { margin: 0.625rem 0 0; text-align: right; font-size: 0.8125rem; color: var(--color-text-muted); }

.shp-inv-vat { margin: 1.5rem 0 0; }
.shp-inv-vat table { width: 100%; border-collapse: collapse; font-size: 0.875rem; max-width: 30rem; margin-left: auto; }
.shp-inv-vat th { text-align: right; padding: 0.375rem 0.5rem 0.375rem 0; border-bottom: 1px solid var(--color-border); color: var(--color-text-muted); font-weight: 600; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.02em; }
.shp-inv-vat th:first-child { text-align: left; }
.shp-inv-vat td { padding: 0.375rem 0.5rem 0.375rem 0; border-bottom: 1px solid var(--color-border-subtle, var(--color-border)); color: var(--color-text); text-align: right; font-variant-numeric: tabular-nums; }
.shp-inv-vat td:first-child { text-align: left; }
.shp-inv-vat th:last-child, .shp-inv-vat td:last-child { padding-right: 0; }

.shp-inv-pay { margin: 1.75rem 0 0; display: grid; gap: 0.75rem; }
.shp-inv-pay p { margin: 0; font-size: 0.875rem; color: var(--color-text-muted); }
.shp-inv-pay .shp-inv-block p { margin: 0 0 0.375rem; }
.shp-inv-foot { margin: 1.5rem 0 0; padding-top: 0.75rem; border-top: 1px solid var(--color-border); font-size: 0.8125rem; color: var(--color-text-muted); }

@media (max-width: 560px) {
  .shp-inv-meta { text-align: left; margin-left: 0; }
  .shp-inv-facts { justify-content: start; }
  .shp-inv-totals { max-width: none; }
  .shp-inv-vat table { max-width: none; }
}

/* Print and PDF. The renderer opens the invoice page in a headless browser and
   prints it, so these rules are what the PDF actually looks like. The token
   colours are overridden outright: a viewer in dark mode would otherwise be
   handed a black page, and an invoice is a document people genuinely still
   print. */
@media print {
  .shp-inv-head, .shp-inv-parties, .shp-inv-lines, .shp-inv-totals, .shp-inv-vat, .shp-inv-pay, .shp-inv-foot { color: #111 !important; }
  .shp-inv-site, .shp-inv-h1, .shp-inv-name, .shp-inv-grand, .shp-inv-strong,
  .shp-inv-facts dd, .shp-inv-lines td, .shp-inv-totals dd, .shp-inv-vat td { color: #111 !important; }
  .shp-inv-h2, .shp-inv-facts dt, .shp-inv-sku, .shp-inv-detail, .shp-inv-empty, .shp-inv-reg,
  .shp-inv-paid, .shp-inv-pay p, .shp-inv-foot, .shp-inv-totals dt, .shp-inv-lines th, .shp-inv-vat th { color: #444 !important; }
  .shp-inv-head, .shp-inv-lines th, .shp-inv-lines td, .shp-inv-grand, .shp-inv-vat th, .shp-inv-vat td, .shp-inv-foot { border-color: #ccc !important; }
  .shp-inv-lines { page-break-inside: auto; }
  .shp-inv-lines tr { page-break-inside: avoid; page-break-after: auto; }
  .shp-inv-totals, .shp-inv-vat, .shp-inv-pay { page-break-inside: avoid; }
}
`
