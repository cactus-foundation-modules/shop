import { describe, expect, it } from 'vitest'
import { normalisePostcode, orderNumberCandidates, postcodeMatches } from '@/modules/shop/lib/order-lookup'

describe('normalisePostcode', () => {
  it('reduces every way of writing one postcode to the same string', () => {
    for (const written of ['E1 1AA', 'e1 1aa', 'E11AA', 'e1-1aa', '  E1  1AA  ']) {
      expect(normalisePostcode(written)).toBe('E11AA')
    }
  })

  it('is empty for nothing at all', () => {
    expect(normalisePostcode(null)).toBe('')
    expect(normalisePostcode(undefined)).toBe('')
    expect(normalisePostcode('   ')).toBe('')
  })

  it('leaves a postcode that is not British alone', () => {
    expect(normalisePostcode('1012 AB')).toBe('1012AB')
    expect(normalisePostcode('D02 X285')).toBe('D02X285')
  })
})

describe('postcodeMatches', () => {
  it('accepts the same postcode however it was typed', () => {
    expect(postcodeMatches('E1 1AA', 'E11AA')).toBe(true)
    expect(postcodeMatches('e11aa', 'E1 1AA')).toBe(true)
    expect(postcodeMatches('E1-1AA', 'e1 1aa')).toBe(true)
  })

  it('refuses a different postcode', () => {
    expect(postcodeMatches('B29 7QB', 'E1 1AA')).toBe(false)
  })

  // The whole point of the lock. An order with no postcode on it - possible on
  // a shop delivering somewhere that does not use them - must not be openable
  // by leaving the box empty.
  it('never matches on nothing typed', () => {
    expect(postcodeMatches('', 'E1 1AA')).toBe(false)
    expect(postcodeMatches('', '')).toBe(false)
    expect(postcodeMatches(null, null)).toBe(false)
  })
})

describe('orderNumberCandidates', () => {
  it('finds the full number from every way a customer types it', () => {
    for (const typed of ['DW000172', 'dw000172', '000172', '172', 'DW 172', 'dw-000172']) {
      expect(orderNumberCandidates(typed, 'DW')).toContain('DW000172')
    }
  })

  it('keeps the number to the shop that issued it', () => {
    expect(orderNumberCandidates('172', 'OSR')).toContain('OSR000172')
    expect(orderNumberCandidates('172', 'OSR')).not.toContain('DW000172')
  })

  it('offers what was typed as well, for a shop numbering its own way', () => {
    expect(orderNumberCandidates('2026000172', '')).toContain('2026000172')
  })

  it('does not pad a sequence that has outgrown the padding', () => {
    expect(orderNumberCandidates('1234567', 'DW')).toContain('DW1234567')
  })

  it('has nothing to look up for an empty box', () => {
    expect(orderNumberCandidates('', 'DW')).toEqual([])
    expect(orderNumberCandidates('   -  ', 'DW')).toEqual([])
    expect(orderNumberCandidates(null, 'DW')).toEqual([])
  })

  it('leaves a number with letters in the body alone rather than padding it', () => {
    expect(orderNumberCandidates('DWABC', 'DW')).toEqual(['DWABC'])
  })
})
