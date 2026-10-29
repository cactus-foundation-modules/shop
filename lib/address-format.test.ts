import { describe, it, expect } from 'vitest'
import { formatAddress, formatAddressText, formatPostcode } from './address-format'

const uk = (s: string) => formatAddressText(s, 'GB')

describe('formatAddressText (UK)', () => {
  it('title cases lazy and shouted input', () => {
    expect(uk('12 high street')).toBe('12 High Street')
    expect(uk('12 HIGH STREET')).toBe('12 High Street')
  })

  it('lowercases connectors inside place names, hyphenated or not', () => {
    expect(uk('stratford-upon-avon')).toBe('Stratford-upon-Avon')
    expect(uk('STOKE-ON-TRENT')).toBe('Stoke-on-Trent')
    expect(uk('newcastle upon tyne')).toBe('Newcastle upon Tyne')
    expect(uk('barrow-in-furness')).toBe('Barrow-in-Furness')
    expect(uk('chapel-en-le-frith')).toBe('Chapel-en-le-Frith')
    expect(uk('ashby-de-la-zouch')).toBe('Ashby-de-la-Zouch')
    expect(uk('bourton-on-the-water')).toBe('Bourton-on-the-Water')
    expect(uk('isle of wight')).toBe('Isle of Wight')
    expect(uk('weston-super-mare')).toBe('Weston-super-Mare')
    expect(uk('wells-next-the-sea')).toBe('Wells-next-the-Sea')
    expect(uk('betws-y-coed')).toBe('Betws-y-Coed')
  })

  it('repairs a Title Cased connector in a hyphenated name', () => {
    expect(uk('Stratford-Upon-Avon')).toBe('Stratford-upon-Avon')
  })

  it('keeps the first word and clause starts capitalised', () => {
    expect(uk('the old rectory')).toBe('The Old Rectory')
    expect(uk('flat 1, the old mill')).toBe('Flat 1, The Old Mill')
    expect(uk('de montfort street')).toBe('De Montfort Street')
  })

  it('does not lowercase hyphen-only connectors elsewhere', () => {
    expect(uk('pet super store')).toBe('Pet Super Store')
    expect(uk('opposite next')).toBe('Opposite Next')
  })

  it('handles apostrophes', () => {
    expect(uk("bishop's stortford")).toBe("Bishop's Stortford")
    expect(uk("ST JOHN'S ROAD")).toBe("St John's Road")
    expect(uk("o'connell street")).toBe("O'Connell Street")
    expect(uk('d’arcy road')).toBe('D’Arcy Road')
  })

  it('handles Mc but not Mac', () => {
    expect(uk('mcdonald road')).toBe('McDonald Road')
    expect(uk('macclesfield')).toBe('Macclesfield')
  })

  it('handles hyphenated surnames and Co-op', () => {
    expect(uk('smith-jones way')).toBe('Smith-Jones Way')
    expect(uk('co-op building')).toBe('Co-op Building')
  })

  it('handles ordinals, unit letters and road codes', () => {
    expect(uk('21st century house')).toBe('21st Century House')
    expect(uk('1st floor')).toBe('1st Floor')
    expect(uk('12a high st')).toBe('12A High St')
    expect(uk('unit 3b')).toBe('Unit 3B')
    expect(uk('2f1 leith walk')).toBe('2F1 Leith Walk')
    expect(uk('off the m25 near a41')).toBe('Off the M25 Near A41')
    expect(uk('flat a')).toBe('Flat A')
  })

  it('keeps acronyms and abbreviations', () => {
    expect(uk('po box 12')).toBe('PO Box 12')
    expect(uk('p.o. box 12')).toBe('P.O. Box 12')
    expect(uk('c/o mr smith')).toBe('c/o Mr Smith')
    expect(uk('UK HQ')).toBe('UK Hq')
  })

  it('keeps roman numerals only in an ALL CAPS field', () => {
    expect(uk('HENRY VIII ROAD')).toBe('Henry VIII Road')
    expect(uk('MILL LANE')).toBe('Mill Lane')
  })

  it('leaves mixed-case words alone in a mixed field', () => {
    expect(uk('MacLeod House, high street')).toBe('MacLeod House, High Street')
    expect(uk('Unit 5 BT Tower')).toBe('Unit 5 BT Tower')
    expect(uk('Rose Cottage')).toBe('Rose Cottage')
  })

  it('collapses whitespace and handles accents', () => {
    expect(uk('  12   high   street ')).toBe('12 High Street')
    expect(uk('ÉCOLE ROAD')).toBe('École Road')
  })

  it('is idempotent', () => {
    for (const s of [
      'stratford-upon-avon', "BISHOP'S STORTFORD", 'flat 1, the old mill', 'HENRY VIII ROAD',
      '12a high st', 'newcastle upon tyne', 'MacLeod House', 'c/o mr smith', 'betws-y-coed', 'unit 3b',
    ]) {
      const once = uk(s)
      expect(uk(once)).toBe(once)
    }
  })
})

describe('formatAddressText (abroad)', () => {
  it('only touches wholly lower or upper case fields, plainly', () => {
    expect(formatAddressText('rue de la paix', 'FR')).toBe('Rue De La Paix')
    expect(formatAddressText('Rue de la Paix', 'FR')).toBe('Rue de la Paix')
    expect(formatAddressText('1600 PENNSYLVANIA AVENUE', 'US')).toBe('1600 Pennsylvania Avenue')
  })
})

describe('formatPostcode', () => {
  it('uppercases and spaces a UK postcode', () => {
    expect(formatPostcode('sw1a1aa', 'GB')).toBe('SW1A 1AA')
    expect(formatPostcode(' m1  1ae ', 'GB')).toBe('M1 1AE')
    expect(formatPostcode('ec1a 1bb')).toBe('EC1A 1BB')
    expect(formatPostcode('gir0aa', 'GB')).toBe('GIR 0AA')
  })
  it('only uppercases elsewhere', () => {
    expect(formatPostcode('k1a0b1', 'CA')).toBe('K1A0B1')
    expect(formatPostcode('1234 ab', 'NL')).toBe('1234 AB')
  })
  it('is idempotent', () => {
    expect(formatPostcode(formatPostcode('sw1a1aa', 'GB'), 'GB')).toBe('SW1A 1AA')
  })
})

describe('formatAddress', () => {
  it('tidies postal fields and leaves names, company, phone and country alone', () => {
    const out = formatAddress({
      firstName: 'ann', lastName: 'MCDONALD', company: 'acme ltd', line1: '12 high street', line2: '',
      city: 'stoke-on-trent', county: 'staffordshire', postcode: 'st11aa', country: 'GB', phone: '020 8138 0512',
    })
    expect(out).toEqual({
      firstName: 'ann', lastName: 'MCDONALD', company: 'acme ltd', line1: '12 High Street', line2: '',
      city: 'Stoke-on-Trent', county: 'Staffordshire', postcode: 'ST1 1AA', country: 'GB', phone: '020 8138 0512',
    })
  })
})
