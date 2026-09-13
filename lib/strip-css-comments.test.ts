import { describe, expect, it } from 'vitest'
import { stripCssComments } from './strip-css-comments'
import { shopCardCss } from '@/modules/shop/components/puck/parts/card-parts'
import { DEFAULT_BREAKPOINTS } from '@/modules/shop/lib/breakpoints-shared'
import { SHOP_SECTION_HEAD_CSS } from '@/modules/shop/components/puck/parts/section-head-css'
import { galleryCss, tabsCss } from '@/modules/shop/components/puck/parts/detail-parts'

// A stylesheet that has lost a rule looks exactly like one that has lost a
// comment until somebody opens the page it was styling. So what goes is asserted
// as precisely as what stays.

// Every declaration block in a sheet, comments removed by a deliberately
// different method, so the check below is not the function marking its own work.
function rulesOf(css: string): string[] {
  return css
    .split('/*')
    .map((part, index) => (index === 0 ? part : part.slice(part.indexOf('*/') + 2)))
    .join('')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
}

describe('stripCssComments', () => {
  it('removes a comment on a line of its own, and the line with it', () => {
    expect(stripCssComments('.a{color:red}\n/* why */\n.b{color:blue}\n')).toBe('.a{color:red}\n.b{color:blue}\n')
  })

  it('removes a comment that runs over several lines', () => {
    expect(stripCssComments('.a{color:red}\n/* one\n   two\n   three */\n.b{color:blue}')).toBe('.a{color:red}\n.b{color:blue}')
  })

  it('removes a comment inside a rule and leaves the declarations either side', () => {
    expect(stripCssComments('.a{color:red;/* note */display:block}')).toBe('.a{color:red;display:block}')
  })

  it('leaves a quoted string alone, even one that looks like a comment', () => {
    expect(stripCssComments(".a::after{content:'/* not a comment */'}")).toBe(".a::after{content:'/* not a comment */'}")
    expect(stripCssComments('.a::after{content:"x\\"/*y"}/* gone */')).toBe('.a::after{content:"x\\"/*y"}')
  })

  it('treats an unterminated comment as running to the end', () => {
    expect(stripCssComments('.a{color:red}\n/* never closed')).toBe('.a{color:red}\n')
  })

  it('keeps selectors that carry > and & intact', () => {
    expect(stripCssComments('.a > .b{x:1}\n/* c */\n.c:has(> &){y:2}')).toBe('.a > .b{x:1}\n.c:has(> &){y:2}')
  })

  it('passes a sheet with no comments through unchanged', () => {
    const css = '\n.a{color:red}\n@media (max-width:640px){\n.b{color:blue}\n}\n'
    expect(stripCssComments(css)).toBe(css)
  })
})

describe('the card stylesheet on the wire', () => {
  it('carries no comments', () => {
    expect(shopCardCss(DEFAULT_BREAKPOINTS)).not.toContain('/*')
  })

  it('carries every rule the commented source does, in the same order', () => {
    // The section head is the one piece of the sheet that is also exported on its
    // own with its comment still in, so it stands in for the source here.
    const sheet = shopCardCss(DEFAULT_BREAKPOINTS)
    const headRules = rulesOf(SHOP_SECTION_HEAD_CSS)
    const sheetLines = sheet.split('\n').map((line) => line.trim())
    const start = sheetLines.indexOf(headRules[0]!)
    expect(start).toBeGreaterThan(-1)
    expect(sheetLines.slice(start, start + headRules.length)).toEqual(headRules)
  })

  it('still names both breakpoints', () => {
    const sheet = shopCardCss({ ...DEFAULT_BREAKPOINTS, tabletBp: '1111px', mobileBp: '555px' })
    expect(sheet).toContain('@media (max-width:1111px)')
    expect(sheet).toContain('@media (max-width:555px)')
  })
})

describe('the product page sheets on the wire', () => {
  // These two are exported with their comments in, so the stripped sheet can be
  // held against the whole commented one, line for line, rather than sampled.
  const BP = { tabletBp: '1024px', mobileBp: '640px' }
  for (const [label, css] of [['gallery', galleryCss(BP, 60)], ['tabs', tabsCss(BP)]] as const) {
    it(`keeps every line of the ${label} sheet that is not a comment, in order`, () => {
      const stripped = stripCssComments(css)
      expect(stripped).not.toContain('/*')
      expect(stripped.split('\n').map((line) => line.trim()).filter(Boolean)).toEqual(rulesOf(css))
    })
  }
})
