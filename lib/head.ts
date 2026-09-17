// Scanned by scripts/generate-module-router.mjs and rendered by the core public
// layout on every public page: what shop needs at the top of the page before
// anything paints.
//
// One thing so far - the shopper's with/without VAT switch. Their saved choice
// has to be on <html> before the first price is drawn, or a shopper who asked
// for prices with VAT would watch every figure on the page change a moment after
// it loaded. See lib/tax-view-shared.ts for the whole pattern.

import { getShopConfigCached } from '@/modules/shop/lib/config'
import { displayIncludesTax } from '@/modules/shop/lib/tax-display-shared'
import { taxViewBootScript } from '@/modules/shop/lib/tax-view-shared'

export type PublicHead = {
  jsonLd: object[]
  meta: Array<{ name?: string; property?: string; content: string }>
  links: Array<{ rel: string; href: string; type?: string; title?: string; hrefLang?: string }>
  /** Inline scripts run before the page paints, each with an id of its own. */
  scripts: Array<{ id: string; content: string }>
}

const EMPTY: PublicHead = { jsonLd: [], meta: [], links: [], scripts: [] }

export async function getPublicHead(siteUrl: string): Promise<PublicHead> {
  void siteUrl
  try {
    const config = await getShopConfigCached()
    // A shop that has not switched it on gets nothing on its pages at all.
    if (!config.priceDisplayTaxSwitch) return EMPTY
    const opensIncluding = displayIncludesTax({
      mode: config.priceDisplayTax,
      storedIncludesTax: config.taxMode === 'INCLUSIVE',
      suffix: '',
    })
    return {
      ...EMPTY,
      scripts: [{ id: 'shop-tax-view-init', content: taxViewBootScript(opensIncluding ? 'inc' : 'ex') }],
    }
  } catch (err) {
    // The page is right without the script - every figure is printed on the
    // shop's own side by default - so a config that cannot be read costs a
    // shopper who chose the other side their choice for one page, not the page.
    console.error('[shop] public head failed:', err)
    return EMPTY
  }
}
