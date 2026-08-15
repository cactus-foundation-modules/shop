import { describe, expect, it } from 'vitest'
import { AA_NORMAL_TEXT, contrastRatio, formatRatio, luminance, meetsAaNormal, parseHex } from '@/modules/shop/lib/contrast'

describe('parseHex', () => {
  it('reads six-digit hex with or without the hash', () => {
    expect(parseHex('#4DB3AC')).toEqual([77, 179, 172])
    expect(parseHex('4DB3AC')).toEqual([77, 179, 172])
  })

  it('reads three-digit shorthand', () => {
    expect(parseHex('#fff')).toEqual([255, 255, 255])
    expect(parseHex('#000')).toEqual([0, 0, 0])
  })

  it('is case-insensitive and tolerates surrounding space', () => {
    expect(parseHex('  #f2f1ee  ')).toEqual([242, 241, 238])
  })

  // The pickers also accept a site colour, which reaches the storefront as a CSS
  // variable. Nothing here can measure one, and pretending otherwise would put a
  // confident wrong warning on a perfectly good badge.
  it('refuses anything it cannot measure', () => {
    expect(parseHex('var(--color-primary)')).toBeNull()
    expect(parseHex('rebeccapurple')).toBeNull()
    expect(parseHex('#12345')).toBeNull()
    expect(parseHex('')).toBeNull()
    expect(parseHex(null)).toBeNull()
    expect(parseHex(undefined)).toBeNull()
  })
})

describe('luminance', () => {
  it('lands on the WCAG endpoints', () => {
    expect(luminance([0, 0, 0])).toBeCloseTo(0, 10)
    expect(luminance([255, 255, 255])).toBeCloseTo(1, 10)
  })
})

describe('contrastRatio', () => {
  it('gives 21:1 for black on white', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 6)
  })

  it('gives 1:1 for a colour on itself', () => {
    expect(contrastRatio('#4DB3AC', '#4DB3AC')).toBeCloseTo(1, 10)
  })

  it('is the same whichever way round the pair is given', () => {
    const a = contrastRatio('#1A5F5A', '#FFFFFF')
    const b = contrastRatio('#FFFFFF', '#1A5F5A')
    expect(a).toBeCloseTo(b as number, 10)
  })

  it('is null when either colour cannot be measured', () => {
    expect(contrastRatio('var(--color-fg)', '#ffffff')).toBeNull()
    expect(contrastRatio('#ffffff', null)).toBeNull()
  })
})

// The real pairs off this shop's shp_tags rows, which is what the warning is
// for. The "New" dark pair is the one that failed in the wild.
describe('the tag badges as configured', () => {
  it('flags the New badge in dark mode', () => {
    const ratio = contrastRatio('#F2F1EE', '#4DB3AC') as number
    expect(ratio).toBeLessThan(AA_NORMAL_TEXT)
    expect(formatRatio(ratio)).toBe('2.2:1')
    expect(meetsAaNormal('#F2F1EE', '#4DB3AC')).toBe(false)
  })

  it('passes the New badge in light mode', () => {
    expect(meetsAaNormal('#FFFFFF', '#1A5F5A')).toBe(true)
  })

  it('passes Staff Pick, which uses dark ink on the same sort of fill', () => {
    expect(meetsAaNormal('#2B2D30', '#E3A857')).toBe(true)
  })

  // The suggested repair for New: the ink Staff Pick already uses, on the same
  // teal. Worth pinning so the advice in the report is not merely plausible.
  it('dark ink on that teal clears AA comfortably', () => {
    const ratio = contrastRatio('#2B2D30', '#4DB3AC') as number
    expect(ratio).toBeGreaterThan(AA_NORMAL_TEXT)
  })
})

describe('meetsAaNormal', () => {
  it('says nothing rather than guessing when it cannot measure', () => {
    expect(meetsAaNormal('var(--color-on-primary)', '#4DB3AC')).toBeNull()
  })
})

describe('formatRatio', () => {
  it('writes ratios the conventional way', () => {
    expect(formatRatio(4.5)).toBe('4.5:1')
    expect(formatRatio(21)).toBe('21:1')
    expect(formatRatio(2.2231)).toBe('2.2:1')
  })
})
