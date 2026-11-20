import { describe, expect, it } from 'vitest'
import { EMPTY_ADDRESS, type ShpAddressForm } from '@/modules/shop/components/public/checkout-state'
import { countyAfterEdit, editOwnsCounty, outwardCode } from '@/modules/shop/components/public/checkout-lookup-county'

// The London hit the finder offers first for "22 Percy Street".
const LONDON_PICK = { county: 'Greater London', postcode: 'W1T 2BU' }

function form(over: Partial<ShpAddressForm>): ShpAddressForm {
  return { ...EMPTY_ADDRESS, ...over }
}

describe('outwardCode', () => {
  it('reads the area half of a UK postcode, spaced or not', () => {
    expect(outwardCode('S65 1ED')).toBe('S65')
    expect(outwardCode('s651ed')).toBe('S65')
    expect(outwardCode('W1T 2BU')).toBe('W1T')
    expect(outwardCode('EC3V 1LP')).toBe('EC3V')
  })

  it('compares anything unfinished or foreign whole', () => {
    expect(outwardCode('S65 1E')).toBe('S651E')
    expect(outwardCode('D02 X285')).toBe('D02X285')
  })
})

describe('countyAfterEdit', () => {
  it('drops a lookup county when the postcode moves to another area (the Rotherham order)', () => {
    const current = form({ city: 'Rotherham', county: 'Greater London', postcode: 'W1T 2BU' })
    expect(countyAfterEdit(current, 'postcode', 'S65 1ED', LONDON_PICK)).toBe('')
  })

  it('keeps it while the postcode stays in the same area', () => {
    const current = form({ county: 'Greater London', postcode: 'W1T 2BU' })
    expect(countyAfterEdit(current, 'postcode', 'W1T 2BX', LONDON_PICK)).toBe('Greater London')
  })

  it('puts it back when the postcode is retyped into the same area', () => {
    const current = form({ county: '', postcode: 'W1T' })
    expect(countyAfterEdit(current, 'postcode', 'W1T 2BU', LONDON_PICK)).toBe('Greater London')
  })

  it('never touches a county the shopper typed', () => {
    const current = form({ county: 'South Yorkshire', postcode: 'W1T 2BU' })
    expect(countyAfterEdit(current, 'postcode', 'S65 1ED', LONDON_PICK)).toBe('South Yorkshire')
  })

  it('does nothing with no lookup, or for any other box', () => {
    const current = form({ county: 'Greater London', postcode: 'W1T 2BU' })
    expect(countyAfterEdit(current, 'postcode', 'S65 1ED', null)).toBe('Greater London')
    expect(countyAfterEdit(current, 'city', 'Rotherham', LONDON_PICK)).toBe('Greater London')
  })

  it('passes the county box\'s own edits straight through', () => {
    const current = form({ county: 'Greater London', postcode: 'W1T 2BU' })
    expect(countyAfterEdit(current, 'county', 'Middlesex', LONDON_PICK)).toBe('Middlesex')
  })

  it('hands the county to the shopper once they type in it', () => {
    expect(editOwnsCounty('county')).toBe(true)
    expect(editOwnsCounty('postcode')).toBe(false)
  })
})
