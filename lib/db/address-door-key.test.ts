import { describe, it, expect } from 'vitest'
import { addressDoorKey } from '@/modules/shop/lib/db/addresses'

// The key decides whether an address a shopper has just ordered to is already
// in their address book. Get it wrong in the loose direction and two genuinely
// different doors merge into one; get it wrong in the strict direction and the
// book grows a near-identical copy on every single order. Both failures are
// quiet, so they are pinned here.
//
// The other half of this pair lives in SQL, inside rememberAddressForMember -
// the same key rebuilt in Postgres so the dedupe can be one atomic statement.
// This file can only prove the JavaScript half; a change to either side has to
// be made to both, and checked against a real database.
describe('addressDoorKey', () => {
  it('ignores how the shopper happened to type the postcode', () => {
    const typed = addressDoorKey({ line1: '10 Downing Street', postcode: 'SW1A 2AA' })
    const retyped = addressDoorKey({ line1: '10 Downing Street', postcode: 'sw1a2aa' })
    expect(retyped).toBe(typed)
  })

  it('ignores case and spacing anywhere in the address', () => {
    const a = addressDoorKey({ line1: '10 Downing Street', line2: 'Flat  B', postcode: 'SW1A 2AA' })
    const b = addressDoorKey({ line1: '10  DOWNING street', line2: 'flat b', postcode: 'SW1A2AA' })
    expect(b).toBe(a)
  })

  it('treats a missing second line and an empty one as the same address', () => {
    expect(addressDoorKey({ line1: '1 High Street', postcode: 'LS1 1AA' }))
      .toBe(addressDoorKey({ line1: '1 High Street', line2: '', postcode: 'LS1 1AA' }))
  })

  it('keeps two flats at one postcode apart', () => {
    const flat1 = addressDoorKey({ line1: '20 High Street', line2: 'Flat 1', postcode: 'LS1 1AA' })
    const flat2 = addressDoorKey({ line1: '20 High Street', line2: 'Flat 2', postcode: 'LS1 1AA' })
    expect(flat2).not.toBe(flat1)
  })

  it('keeps two houses on one street apart', () => {
    expect(addressDoorKey({ line1: '20 High Street', postcode: 'LS1 1AA' }))
      .not.toBe(addressDoorKey({ line1: '22 High Street', postcode: 'LS1 1AA' }))
  })

  it('does not let the field separator be typed into a collision', () => {
    // "a|b" in line1 with nothing else must not read as line1 "a", line2 "b".
    expect(addressDoorKey({ line1: 'a|b', postcode: 'LS1 1AA' }))
      .not.toBe(addressDoorKey({ line1: 'a', line2: 'b', postcode: 'LS1 1AA' }))
  })
})
