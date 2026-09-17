// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  TAX_VIEW_CSS,
  TAX_VIEW_ROOT_ATTRIBUTE,
  TAX_VIEW_STORAGE_KEY,
  TAX_VIEW_STYLE_ID,
  taxViewAmounts,
  taxViewBootScript,
  type ProductTaxView,
} from '@/modules/shop/lib/tax-view-shared'
import { currentTaxViewSide } from '@/modules/shop/lib/tax-view-client'
import { TaxViewMoney, TaxViewNote } from '@/modules/shop/components/public/TaxViewText'
import { TaxViewToggle } from '@/modules/shop/components/public/TaxViewToggle'

// The shopper's with/without VAT switch. What must not regress: the figure the
// shop opens on is always exactly the one it printed before, a page whose script
// never ran still shows only that one, and the saved choice is what the next
// page opens on.

const NET_SHOP: ProductTaxView = {
  defaultSide: 'ex',
  rate: 0.2,
  excludingNote: '+ VAT',
  includingNote: 'inc. VAT',
  showIncludingLabel: 'Show prices including VAT',
  showExcludingLabel: 'Show prices excluding VAT',
}
const GROSS_SHOP: ProductTaxView = { ...NET_SHOP, defaultSide: 'inc' }

const money = (amount: number) => `£${amount.toFixed(2)}`

function runBootScript(defaultSide: 'inc' | 'ex') {
  // Run the exact string the page carries, not a re-implementation of it.
  new Function(taxViewBootScript(defaultSide))()
}

// A plain in-memory Storage. Newer Node ships a global `localStorage` of its own
// that shadows jsdom's and refuses to work without a backing file, so the test
// installs one it controls rather than depending on which of the two wins.
function installMemoryStorage() {
  const entries = new Map<string, string>()
  const storage: Storage = {
    get length() { return entries.size },
    clear: () => entries.clear(),
    getItem: (key) => entries.get(key) ?? null,
    key: (index) => [...entries.keys()][index] ?? null,
    removeItem: (key) => { entries.delete(key) },
    setItem: (key, value) => { entries.set(key, String(value)) },
  }
  Object.defineProperty(window, 'localStorage', { value: storage, configurable: true })
}

function resetDocument() {
  installMemoryStorage()
  document.documentElement.removeAttribute(TAX_VIEW_ROOT_ATTRIBUTE)
  document.getElementById(TAX_VIEW_STYLE_ID)?.remove()
  document.body.innerHTML = ''
}

describe('taxViewAmounts', () => {
  it('keeps the printed figure exact on the side the shop opens on', () => {
    expect(taxViewAmounts(97, NET_SHOP)).toEqual({ ex: 97, inc: 116.4 })
    expect(taxViewAmounts(116.4, GROSS_SHOP)).toEqual({ inc: 116.4, ex: 97 })
  })

  it('rounds the other side to the penny', () => {
    expect(taxViewAmounts(10.01, NET_SHOP).inc).toBe(12.01)
    expect(taxViewAmounts(10, GROSS_SHOP).ex).toBe(8.33)
  })

  it('moves nothing on a zero-rated line', () => {
    expect(taxViewAmounts(42.5, { ...NET_SHOP, rate: 0 })).toEqual({ inc: 42.5, ex: 42.5 })
    expect(taxViewAmounts(42.5, { ...NET_SHOP, rate: Number.NaN })).toEqual({ inc: 42.5, ex: 42.5 })
  })
})

describe('taxViewBootScript', () => {
  beforeEach(resetDocument)
  afterEach(resetDocument)

  it("opens on the shop's own side when the shopper has never chosen", () => {
    runBootScript('ex')
    expect(document.documentElement.getAttribute(TAX_VIEW_ROOT_ATTRIBUTE)).toBe('ex')
    expect(document.getElementById(TAX_VIEW_STYLE_ID)?.textContent).toBe(TAX_VIEW_CSS)
  })

  it("opens on the shopper's saved side", () => {
    window.localStorage.setItem(TAX_VIEW_STORAGE_KEY, 'inc')
    runBootScript('ex')
    expect(document.documentElement.getAttribute(TAX_VIEW_ROOT_ATTRIBUTE)).toBe('inc')
  })

  it('ignores a saved value it does not recognise', () => {
    window.localStorage.setItem(TAX_VIEW_STORAGE_KEY, 'gross')
    runBootScript('inc')
    expect(document.documentElement.getAttribute(TAX_VIEW_ROOT_ATTRIBUTE)).toBe('inc')
  })

  it('adds its stylesheet once however often it runs', () => {
    runBootScript('ex')
    runBootScript('ex')
    expect(document.querySelectorAll(`#${TAX_VIEW_STYLE_ID}`)).toHaveLength(1)
  })
})

describe('TaxViewMoney and TaxViewNote', () => {
  it('prints exactly what it printed before where the switch is off', () => {
    expect(renderToStaticMarkup(createElement(TaxViewMoney, { amount: 97, view: null, format: money }))).toBe('£97.00')
    expect(renderToStaticMarkup(createElement(TaxViewNote, { view: null, suffix: 'ex. VAT', className: 'note' }))).toBe('<span class="note">ex. VAT</span>')
    expect(renderToStaticMarkup(createElement(TaxViewNote, { view: null, suffix: '', className: 'note' }))).toBe('')
  })

  it("prints both sides with only the shop's own one visible", () => {
    const html = renderToStaticMarkup(createElement(TaxViewMoney, { amount: 97, view: NET_SHOP, format: money }))
    expect(html).toBe('<span data-shop-tax-side="ex">£97.00</span><span data-shop-tax-side="inc" hidden="">£116.40</span>')
  })

  it('hides the other side on a shop that opens gross', () => {
    const html = renderToStaticMarkup(createElement(TaxViewMoney, { amount: 116.4, view: GROSS_SHOP, format: money }))
    expect(html).toBe('<span data-shop-tax-side="ex" hidden="">£97.00</span><span data-shop-tax-side="inc">£116.40</span>')
  })

  it('prints nothing where neither side has any wording', () => {
    const view = { ...NET_SHOP, excludingNote: '', includingNote: '' }
    expect(renderToStaticMarkup(createElement(TaxViewNote, { view, suffix: 'ex. VAT', className: 'note' }))).toBe('')
  })
})

describe('TaxViewToggle', () => {
  beforeEach(() => {
    ;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    resetDocument()
  })
  afterEach(resetDocument)

  it('renders nothing where the switch is off', () => {
    expect(renderToStaticMarkup(createElement(TaxViewToggle, { view: null }))).toBe('')
  })

  it('flips the page to the other side, remembers it, and flips back', async () => {
    runBootScript('ex')
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    await act(async () => root.render(createElement(TaxViewToggle, { view: NET_SHOP })))
    const button = container.querySelector('button')!
    // The offer while figures are net is the gross one, and only that one shows
    // before any stylesheet is involved.
    const visible = () => [...button.querySelectorAll('span')].filter((span) => !span.hidden).map((span) => span.textContent)
    expect(visible()).toEqual(['Show prices including VAT'])

    await act(async () => button.click())
    expect(currentTaxViewSide('ex')).toBe('inc')
    expect(window.localStorage.getItem(TAX_VIEW_STORAGE_KEY)).toBe('inc')

    await act(async () => button.click())
    expect(currentTaxViewSide('ex')).toBe('ex')
    expect(window.localStorage.getItem(TAX_VIEW_STORAGE_KEY)).toBe('ex')
    await act(async () => root.unmount())
  })
})
