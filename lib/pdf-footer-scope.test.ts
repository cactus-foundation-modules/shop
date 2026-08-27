import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

// The running PDF footer is drawn by handing Chrome a `footerTemplate` built
// from two things lifted out of the printed page: the footer region's markup,
// and the stylesheets that go with it.
//
// WHICH stylesheets is the whole thing, and getting it wrong is invisible to
// every other check in this suite. The first version swept the page for every
// `<style>` on it, on the reasoning that the footer should look like the
// document. What that actually copied into the template was the document page's
// own chrome-stripping rule:
//
//     body > *:not(main) { display: none !important; }
//
// which is there to hide the site header and footer around the document. Inside
// the template the footer's own wrapper IS a child of body and is not `main`, so
// the rule matched it and the PDF printed no footer at all - on every page, with
// no error, for every document. tsc, eslint and every test here passed
// throughout; it took printing a PDF and looking at it.
//
// The capture end of that pair is core's now (lib/documents/pdf.ts, pinned by
// lib/documents/pdf-footer-scope.test.ts). What is pinned HERE is the other end:
// the rule on this module's document pages that made the sweep dangerous in the
// first place. If it ever stops being there, the guard in core is no longer
// protecting anything, and whoever removed it should decide what replaces it
// rather than finding a test quietly passing for the wrong reason.

const shopDir = join(__dirname, '..')
const read = (relative: string) => readFileSync(join(shopDir, relative), 'utf8')

/** The document pages that get printed. Each strips the site chrome the same
 *  way, and each is a page the PDF renderer opens. */
const DOCUMENT_PAGES = [
  'app/public/shop/invoice/[number]/page.tsx',
  'app/public/shop/credit-note/[number]/page.tsx',
  'app/public/shop/proforma/[number]/page.tsx',
]

describe('the hazard is still there', () => {
  // If this ever stops being true the guard below is no longer protecting
  // anything, and whoever removed the rule should decide what replaces it
  // rather than finding this test quietly passing for the wrong reason.
  it.each(DOCUMENT_PAGES)('%s hides everything that is not <main>', (page) => {
    expect(read(page)).toContain('body > *:not(main) { display: none !important; }')
  })
})
