import { describe, it, expect } from 'vitest'
import {
  bestPostcodeMatch,
  isUnderstoodPostcodePattern,
  matchesAnyPostcodePattern,
  outwardCodeOf,
  parsePostcodePattern,
} from '@/modules/shop/lib/postcode-patterns'

// The real list a UK shop excludes - Highlands, islands, Northern Ireland and
// the Crown dependencies. Every trap in this file came off it.
const HIGHLANDS_AND_ISLANDS = [
  'AB30-AB32', 'AB33-AB38', 'AB41-AB43', 'AB44-AB45', 'AB51-AB56', 'AB63',
  'BT1-BT94', 'FK17-FK21', 'GY1-GY10', 'HS1-HS9', 'IM1-IM9', 'IV1-IV56',
  'JE1-JE5', 'KA27-KA28', 'KW1-KW17', 'PA20-PA78', 'PH10-PH26', 'PH30-PH50',
  'PO30-PO41', 'TR21-TR25', 'ZE1-ZE3',
]

describe('outwardCodeOf', () => {
  // The whole reason ranges cannot be read off the raw string. "GY1 0AA"
  // normalises to GY10AA, and a greedy district read gives 10 - which would
  // exclude a Guernsey address that GY1-GY10 covers anyway, but would also
  // exclude "PH1 0AA" under PH10-PH26, which nobody asked for.
  it('strips the inward code before the district is read', () => {
    expect(outwardCodeOf('GY10AA')).toBe('GY1')
    expect(outwardCodeOf('GY101AA')).toBe('GY10')
    expect(outwardCodeOf('PH10AA')).toBe('PH1')
    expect(outwardCodeOf('EC1A1BB')).toBe('EC1A')
    expect(outwardCodeOf('W1A0AX')).toBe('W1A')
  })

  it('leaves an outward code on its own alone', () => {
    expect(outwardCodeOf('PH10')).toBe('PH10')
    expect(outwardCodeOf('SW')).toBe('SW')
  })
})

describe('parsePostcodePattern', () => {
  it('reads a range with the area written twice', () => {
    expect(parsePostcodePattern('AB30-AB32')).toEqual({ kind: 'range', area: 'AB', from: 30, to: 32 })
  })

  it('reads a range with the second area left off', () => {
    expect(parsePostcodePattern('AB30-32')).toEqual({ kind: 'range', area: 'AB', from: 30, to: 32 })
  })

  it('reads a range written backwards the way it was meant', () => {
    expect(parsePostcodePattern('AB32-AB30')).toEqual({ kind: 'range', area: 'AB', from: 30, to: 32 })
  })

  it('treats anything that is not a range as a prefix, as it always did', () => {
    expect(parsePostcodePattern('SW')).toEqual({ kind: 'prefix', prefix: 'SW' })
    expect(parsePostcodePattern('ab30-bt32')).toEqual({ kind: 'prefix', prefix: 'AB30-BT32' })
  })

  it('normalises case and spacing on the way in', () => {
    expect(parsePostcodePattern(' ph10 - ph26 ')).toEqual({ kind: 'range', area: 'PH', from: 10, to: 26 })
  })
})

describe('isUnderstoodPostcodePattern', () => {
  it('accepts every line of a real exclusion list', () => {
    for (const line of HIGHLANDS_AND_ISLANDS) expect(isUnderstoodPostcodePattern(line)).toBe(true)
  })

  it('accepts a plain prefix', () => {
    expect(isUnderstoodPostcodePattern('SW')).toBe(true)
    expect(isUnderstoodPostcodePattern('9')).toBe(true)
  })

  it('rejects a range across two areas, which would match nothing', () => {
    expect(isUnderstoodPostcodePattern('AB30-BT32')).toBe(false)
  })

  it('rejects half a range and an empty line', () => {
    expect(isUnderstoodPostcodePattern('AB30-')).toBe(false)
    expect(isUnderstoodPostcodePattern('   ')).toBe(false)
  })
})

describe('matchesAnyPostcodePattern', () => {
  it('excludes the districts a range names', () => {
    expect(matchesAnyPostcodePattern(HIGHLANDS_AND_ISLANDS, 'AB30 1AA')).toBe(true)
    expect(matchesAnyPostcodePattern(HIGHLANDS_AND_ISLANDS, 'AB31 4TT')).toBe(true)
    expect(matchesAnyPostcodePattern(HIGHLANDS_AND_ISLANDS, 'AB32 6XX')).toBe(true)
  })

  // The prefix spelling "AB3" would take these too. The range must not.
  it('leaves the districts either side of a range alone', () => {
    expect(matchesAnyPostcodePattern(HIGHLANDS_AND_ISLANDS, 'AB39 3AA')).toBe(false)
    expect(matchesAnyPostcodePattern(HIGHLANDS_AND_ISLANDS, 'AB10 1AA')).toBe(false)
    expect(matchesAnyPostcodePattern(HIGHLANDS_AND_ISLANDS, 'AB25 2ZG')).toBe(false)
  })

  // PH10-PH26 is the sharpest case on the list: PH1 is Perth, delivered to as
  // normal, and every prefix spelling of the range swallows it.
  it('keeps PH1 while taking PH10 upwards', () => {
    expect(matchesAnyPostcodePattern(HIGHLANDS_AND_ISLANDS, 'PH1 5XX')).toBe(false)
    expect(matchesAnyPostcodePattern(HIGHLANDS_AND_ISLANDS, 'PH10 6QW')).toBe(true)
    expect(matchesAnyPostcodePattern(HIGHLANDS_AND_ISLANDS, 'PH26 3XX')).toBe(true)
    expect(matchesAnyPostcodePattern(HIGHLANDS_AND_ISLANDS, 'PH27 1AA')).toBe(false)
    expect(matchesAnyPostcodePattern(HIGHLANDS_AND_ISLANDS, 'PH30 4AA')).toBe(true)
  })

  // Isle of Wight against Portsmouth. Every prefix spelling of PO30-PO41 that
  // is short enough to reach PO30 also reaches PO3, and PO3 is the mainland.
  it('keeps PO3 while taking PO30 upwards', () => {
    expect(matchesAnyPostcodePattern(HIGHLANDS_AND_ISLANDS, 'PO3 5JT')).toBe(false)
    expect(matchesAnyPostcodePattern(HIGHLANDS_AND_ISLANDS, 'PO3 1JT')).toBe(false)
    expect(matchesAnyPostcodePattern(HIGHLANDS_AND_ISLANDS, 'PO31 8QU')).toBe(true)
    expect(matchesAnyPostcodePattern(HIGHLANDS_AND_ISLANDS, 'PO30 1AA')).toBe(true)
    expect(matchesAnyPostcodePattern(HIGHLANDS_AND_ISLANDS, 'PO41 0AA')).toBe(true)
    expect(matchesAnyPostcodePattern(HIGHLANDS_AND_ISLANDS, 'PO42 0AA')).toBe(false)
    expect(matchesAnyPostcodePattern(HIGHLANDS_AND_ISLANDS, 'PO4 9AA')).toBe(false)
    // And the same shape one letter along: TR2 is Truro, TR21 is St Mary's.
    expect(matchesAnyPostcodePattern(HIGHLANDS_AND_ISLANDS, 'TR2 4AA')).toBe(false)
    expect(matchesAnyPostcodePattern(HIGHLANDS_AND_ISLANDS, 'TR21 0AA')).toBe(true)
    // KW1 is Wick and IS on the list; KW is not a mainland-versus-island split.
    expect(matchesAnyPostcodePattern(HIGHLANDS_AND_ISLANDS, 'KW1 4AA')).toBe(true)
  })

  it('takes the whole of Northern Ireland', () => {
    expect(matchesAnyPostcodePattern(HIGHLANDS_AND_ISLANDS, 'BT1 5GS')).toBe(true)
    expect(matchesAnyPostcodePattern(HIGHLANDS_AND_ISLANDS, 'BT94 5AA')).toBe(true)
  })

  it('takes the islands whose postcodes are short', () => {
    expect(matchesAnyPostcodePattern(HIGHLANDS_AND_ISLANDS, 'GY1 1AA')).toBe(true)
    expect(matchesAnyPostcodePattern(HIGHLANDS_AND_ISLANDS, 'JE2 3AA')).toBe(true)
    expect(matchesAnyPostcodePattern(HIGHLANDS_AND_ISLANDS, 'IM1 1AA')).toBe(true)
    expect(matchesAnyPostcodePattern(HIGHLANDS_AND_ISLANDS, 'ZE3 9JX')).toBe(true)
  })

  it('leaves the mainland alone', () => {
    for (const pc of ['SW1A 1AA', 'M1 1AE', 'LS1 4AP', 'B1 1AA', 'EC1A 1BB', 'PO1 3AX', 'TR1 1AA', 'KA1 1AA', 'PA1 1AA', 'FK1 1AA']) {
      expect(matchesAnyPostcodePattern(HIGHLANDS_AND_ISLANDS, pc)).toBe(false)
    }
  })

  it('is not fooled by a single-letter area that looks like a longer one', () => {
    // "B" is Birmingham. It must not be read as the start of "BT".
    expect(matchesAnyPostcodePattern(['BT1-BT94'], 'B1 1AA')).toBe(false)
  })

  it('handles a postcode typed without its space or in lower case', () => {
    expect(matchesAnyPostcodePattern(HIGHLANDS_AND_ISLANDS, 'iv51 9xx')).toBe(true)
    expect(matchesAnyPostcodePattern(HIGHLANDS_AND_ISLANDS, 'IV561AA')).toBe(true)
    expect(matchesAnyPostcodePattern(HIGHLANDS_AND_ISLANDS, 'IV57 1AA')).toBe(false)
  })

  it('matches on an outward code alone, which is all the cart has early on', () => {
    expect(matchesAnyPostcodePattern(HIGHLANDS_AND_ISLANDS, 'KW17')).toBe(true)
    expect(matchesAnyPostcodePattern(HIGHLANDS_AND_ISLANDS, 'KW18')).toBe(false)
  })

  it('matches a single-district range written as one entry', () => {
    expect(matchesAnyPostcodePattern(HIGHLANDS_AND_ISLANDS, 'AB63 5AA')).toBe(true)
    // AB63 is on the list as a bare prefix, so AB63 is where it stops.
    expect(matchesAnyPostcodePattern(HIGHLANDS_AND_ISLANDS, 'AB64 5AA')).toBe(false)
  })
})

describe('bestPostcodeMatch', () => {
  it('scores a longer prefix above a shorter one', () => {
    expect(bestPostcodeMatch(['SW', 'SW1A'], 'SW1A 1AA')).toBe(4)
  })

  it('scores a range as though its low end were written as a prefix', () => {
    expect(bestPostcodeMatch(['AB30-AB32'], 'AB31 1AA')).toBe(4)
    expect(bestPostcodeMatch(['AB'], 'AB31 1AA')).toBe(2)
  })

  it('returns null when nothing matches', () => {
    expect(bestPostcodeMatch(['SW', 'AB30-AB32'], 'M1 1AE')).toBeNull()
  })

  it('ignores an empty list', () => {
    expect(bestPostcodeMatch([], 'SW1A 1AA')).toBeNull()
  })
})
