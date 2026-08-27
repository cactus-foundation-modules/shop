import type { PaperFormat, Page } from 'puppeteer-core'
import { getSiteUrl } from '@/lib/config/env'
import { docPageSetup, PDF_FOOTER_REGION_ID, type DocPageSetup } from '@/modules/shop/lib/doc-page-settings'

// Turning the invoice document into a PDF.
//
// The document is printed by a headless browser opening the invoice's own page,
// so the PDF is the layout the owner designed - the same markup, the same CSS,
// the same figures - rather than a second rendering of it that would drift the
// first time somebody moved a block. The print rules in invoice-doc-css.ts are
// what make it ink on paper rather than a screenshot of a dark-mode page.
//
// Both heavy packages are dynamically imported, so a shop that never presses the
// button never loads a browser. They are declared in core's next.config.ts
// serverExternalPackages, and @sparticuz/chromium's brotli packs are traced into
// every /api/m/** function there - which is what makes this work deployed as
// well as locally.
//
// Two environments, deliberately different:
//
//  - Deployed (Linux serverless): @sparticuz/chromium supplies the binary, and
//    its args are the ones that make chromium survive a read-only filesystem
//    with no /dev/shm worth speaking of.
//  - A developer's own machine: there is no Linux binary to unpack, so it uses a
//    locally installed Chrome. CHROME_PATH names it; failing that the usual
//    macOS and Linux install paths are tried. If none is there, the caller gets
//    a clear refusal rather than a stack trace.

const MAC_CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const MAC_CHROMIUM = '/Applications/Chromium.app/Contents/MacOS/Chromium'
const LINUX_CHROME = '/usr/bin/google-chrome'
const LINUX_CHROMIUM = '/usr/bin/chromium'

/** True on a serverless/Linux deployment, where the packaged chromium is the one
 *  to use. AWS_LAMBDA_FUNCTION_NAME is set on Vercel's Node runtime. */
function isServerless(): boolean {
  return Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.VERCEL)
}

async function localChromePath(): Promise<string | null> {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH
  const { existsSync } = await import('fs')
  for (const candidate of [MAC_CHROME, MAC_CHROMIUM, LINUX_CHROME, LINUX_CHROMIUM]) {
    if (existsSync(candidate)) return candidate
  }
  return null
}

/**
 * The site-relative URL a document is printed from, with a nonce on the end.
 *
 * The nonce is not decoration. `renderInvoicePdf` prints by opening the
 * document's own page over HTTP from the site's public address, which means the
 * request leaves the box and comes back in through whatever sits in front of it.
 * That layer caches, and it does so in spite of the `no-store` this page and
 * every one of these routes answers with - a print URL is a fixed string (the
 * number, its signed token, `print=1`), so once one copy is held, every PDF made
 * afterwards is that copy.
 *
 * What that looked like: an owner published a redesigned proforma layout, saw it
 * on screen, and kept getting PDFs of the old one - for half an hour, from a URL
 * reporting `age: 1671` on a cache MISS. The on-screen page was fine throughout,
 * because a human opens it WITHOUT `print=1` and so never touches the poisoned
 * key. Invoices and credit notes had the same fault and nobody had caught it,
 * because a layout is usually designed once and then left alone.
 *
 * A unique URL per render cannot be served from a cache, whoever is caching and
 * whatever they think of our headers. It costs one query parameter that the page
 * itself never reads.
 */
export function printPath(page: string, token: string): string {
  const nonce = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
  return `${page}?t=${encodeURIComponent(token)}&print=1&r=${nonce}`
}

export class InvoicePdfUnavailableError extends Error {}

/**
 * Prints one invoice to PDF bytes.
 *
 * `path` is a site-relative URL (the invoice's own page, token and all). It is
 * fetched over HTTP from the site's own address rather than rendered in-process,
 * because that is the only way to be certain the PDF and the page agree - and
 * because a Puck layout of async server components cannot be rendered to a
 * string by hand.
 */
/**
 * Chrome draws a running header and footer in a document of its own, with no
 * access to the page's stylesheets, no network and a root font-size of zero -
 * so `0.75rem` in the document's own CSS comes out as nothing at all there.
 *
 * These rules go in FIRST, ahead of the page's own, so every relative size in
 * the invoice stylesheet has a sane base to be relative to and anything the
 * document says about itself still wins.
 */
const RUNNING_FOOTER_RESET = `
html, body { margin: 0; padding: 0; font-size: 12px; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.cactus-pdf-footer { width: 100%; box-sizing: border-box; font-size: 9px; line-height: 1.4; color: #444; }
.cactus-pdf-footer * { box-sizing: border-box; }
.cactus-pdf-footer .shp-inv-footer, .cactus-pdf-footer .shp-inv-notice { margin-top: 0; }
`

type RunningFooter = { html: string; css: string }

/** Lifts the footer region and every stylesheet the document carries out of the
 *  printed page, so the running footer is drawn from the same blocks and the
 *  same rules as the document itself. Null when the shop has published no PDF
 *  footer layout, which is the ordinary case and costs one query selector. */
async function captureRunningFooter(page: Page): Promise<RunningFooter | null> {
  try {
    return await page.evaluate((id: string) => {
      const region = document.getElementById(id)
      const html = region?.innerHTML?.trim() ?? ''
      if (!html) return null
      const css = Array.from(document.querySelectorAll('style'))
        .map((node) => node.textContent ?? '')
        .join('\n')
      return { html, css }
    }, PDF_FOOTER_REGION_ID)
  } catch {
    // A page that would not run script is still a page worth printing. The
    // footer is a nicety; the invoice is the point.
    return null
  }
}

export async function renderInvoicePdf(path: string, setup?: DocPageSetup): Promise<Uint8Array> {
  const [{ default: puppeteer }, chromiumModule] = await Promise.all([
    import('puppeteer-core'),
    isServerless() ? import('@sparticuz/chromium') : Promise.resolve(null),
  ])
  const chromium = chromiumModule?.default ?? null

  let executablePath: string | null = null
  try {
    executablePath = chromium ? await chromium.executablePath() : await localChromePath()
  } catch (error) {
    throw new InvoicePdfUnavailableError(
      `The packaged browser could not be unpacked: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
  if (!executablePath) {
    throw new InvoicePdfUnavailableError(
      'No browser is available to make a PDF. Install Google Chrome locally, or set CHROME_PATH.',
    )
  }

  let browser
  try {
    browser = await puppeteer.launch({
      executablePath,
      args: chromium ? chromium.args : ['--no-sandbox', '--disable-dev-shm-usage'],
      headless: true,
      // Sized to a sheet of A4 at 96dpi, so a layout with a breakpoint in it
      // prints its desktop shape rather than its phone one.
      defaultViewport: { width: 794, height: 1123, deviceScaleFactor: 2 },
    })
  } catch (error) {
    throw new InvoicePdfUnavailableError(
      `The browser would not start: ${error instanceof Error ? error.message : String(error)}`,
    )
  }

  try {
    const page = await browser.newPage()
    const url = `${getSiteUrl()}${path}`
    // 25s of the dispatcher's 60s ceiling. An invoice page is one database read
    // and a logo; anything slower than this is broken, not busy.
    const response = await page.goto(url, { waitUntil: 'networkidle0', timeout: 25_000 })
    if (!response || !response.ok()) {
      throw new InvoicePdfUnavailableError(`The invoice page could not be loaded to print (${response?.status() ?? 'no response'}).`)
    }
    await page.emulateMediaType('print')
    // The paper, the margins and the scale the layout's page settings asked for.
    // Absent - an older caller, or a document with no published layout - falls
    // back to exactly the figures this used to hard-code.
    const paper = setup ?? docPageSetup(undefined)
    const footer = await captureRunningFooter(page)
    const pdf = await page.pdf({
      format: paper.format as PaperFormat,
      // Backgrounds on by default, or every rule and border in the document
      // prints white. A shop that would rather save the ink can say so.
      printBackground: paper.printBackground,
      margin: paper.margin,
      scale: paper.scale,
      preferCSSPageSize: false,
      // The running footer, when the shop has designed one. Chrome will not draw
      // a footer without also drawing a header, so an empty one is supplied -
      // otherwise it helpfully prints today's date and the page URL across the
      // top of somebody's invoice.
      ...(footer
        ? {
            displayHeaderFooter: true,
            headerTemplate: '<span></span>',
            footerTemplate: `<style>${RUNNING_FOOTER_RESET}${footer.css}</style><div class="cactus-pdf-footer" style="padding: 0 ${paper.margin.right} 0 ${paper.margin.left};">${footer.html}</div>`,
          }
        : {}),
    })
    return pdf
  } finally {
    // Always, even when the print threw: a leaked browser on a warm serverless
    // instance is a memory leak that outlives the request that caused it.
    await browser.close().catch(() => {})
  }
}

/** The filename a browser saves it as. */
export function invoicePdfFilename(prefix: string, invoiceNumber: string): string {
  const clean = (value: string) => value.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '')
  return `${clean(prefix) || 'invoice'}-${clean(invoiceNumber) || 'document'}.pdf`
}
