import { describe, it, expect } from 'vitest'
import { formatUkPhone, isValidUkPhone, normaliseStoredPhone, parseUkPhone } from '@/modules/shop/lib/phone'

// A phone number is the only way a driver reaches somebody standing outside a
// locked office, so the accepting half of this matters as much as the rejecting
// half: every shape below is one a real shopper types, and turning any of them
// away is a lost order rather than a caught mistake.

describe('parseUkPhone', () => {
  it('reads a mobile however it is written', () => {
    for (const written of [
      '07445163570',
      '07445 163570',
      '07445-163570',
      '(07445) 163570',
      '+44 7445 163570',
      '+447445163570',
      '+4407445163570',
      '+44 (0)7445 163570',
      '0044 7445 163570',
      '  07445163570  ',
    ]) {
      expect(parseUkPhone(written), written).toBe('07445163570')
    }
  })

  it('reads a landline however it is written', () => {
    for (const written of [
      '02081380512',
      '020 8138 0512',
      '(020) 8138 0512',
      '+44 20 8138 0512',
      '+442081380512',
      '+44 (0)20 8138 0512',
      '0044 20 8138 0512',
    ]) {
      expect(parseUkPhone(written), written).toBe('02081380512')
    }
  })

  it('takes the shorter numbers that are genuinely shorter', () => {
    expect(parseUkPhone('0800 123 456')).toBe('0800123456')
    expect(parseUkPhone('016977 3999')).toBe('0169773999')
  })

  it('takes the other allocated ranges', () => {
    expect(parseUkPhone('0330 123 4567')).toBe('03301234567')
    expect(parseUkPhone('0560 123 4567')).toBe('05601234567')
    expect(parseUkPhone('0906 123 4567')).toBe('09061234567')
  })

  it('refuses a number of the wrong length', () => {
    expect(parseUkPhone('0744516357')).toBeNull()      // mobile a digit short
    expect(parseUkPhone('074451635701')).toBeNull()    // mobile a digit long
    expect(parseUkPhone('0208138051')).toBeNull()      // landline a digit short
    expect(parseUkPhone('07445')).toBeNull()
  })

  it('refuses a country code that is not ours', () => {
    expect(parseUkPhone('+33 6 12 34 56 78')).toBeNull()
    expect(parseUkPhone('+1 415 555 0132')).toBeNull()
    expect(parseUkPhone('0033 612 345 678')).toBeNull()
  })

  it('refuses obvious nonsense', () => {
    expect(parseUkPhone('')).toBeNull()
    expect(parseUkPhone('   ')).toBeNull()
    expect(parseUkPhone(null)).toBeNull()
    expect(parseUkPhone(undefined)).toBeNull()
    expect(parseUkPhone('not a number')).toBeNull()
    expect(parseUkPhone('07445 16357o')).toBeNull()    // letter o for a zero
    expect(parseUkPhone('07445163570 ext 4')).toBeNull()
    expect(parseUkPhone('7445163570')).toBeNull()      // no trunk 0, no country code
    expect(parseUkPhone('06445163570')).toBeNull()     // 06 is not allocated
    expect(parseUkPhone('04445163570')).toBeNull()     // nor 04
    expect(parseUkPhone('00445163570')).toBeNull()     // our country code, too few digits after it
    expect(parseUkPhone('+44007445163570')).toBeNull() // one stray 0 is a trunk code, two is nonsense
  })
})

describe('formatUkPhone', () => {
  it('breaks a mobile five and six, whatever went in', () => {
    expect(formatUkPhone('07445163570')).toBe('07445 163570')
    expect(formatUkPhone('+44 (0)7445 163570')).toBe('07445 163570')
    expect(formatUkPhone('0044 7445-163570')).toBe('07445 163570')
  })

  it('leaves a landline as digits', () => {
    expect(formatUkPhone('020 8138 0512')).toBe('02081380512')
    expect(formatUkPhone('+44 20 8138 0512')).toBe('02081380512')
    expect(formatUkPhone('0800 123 456')).toBe('0800123456')
  })

  it('hands back nothing for a number it cannot read', () => {
    expect(formatUkPhone('+33 6 12 34 56 78')).toBeNull()
    expect(formatUkPhone('')).toBeNull()
  })
})

describe('isValidUkPhone', () => {
  it('agrees with the parser', () => {
    expect(isValidUkPhone('+44 7445 163570')).toBe(true)
    expect(isValidUkPhone('020 8138 0512')).toBe(true)
    expect(isValidUkPhone('0712345')).toBe(false)
    expect(isValidUkPhone('')).toBe(false)
  })
})

describe('normaliseStoredPhone', () => {
  it('stores a readable number in canonical form', () => {
    expect(normaliseStoredPhone(' +44 (0)7445 163570 ')).toBe('07445 163570')
    expect(normaliseStoredPhone('+44 20 8138 0512')).toBe('02081380512')
  })

  it('stores nothing at all for a blank box', () => {
    expect(normaliseStoredPhone('')).toBeNull()
    expect(normaliseStoredPhone('   ')).toBeNull()
    expect(normaliseStoredPhone(null)).toBeNull()
  })

  it('keeps what was typed when it is not a UK number', () => {
    // The admin's own order screen takes overseas customers; throwing their
    // number away would lose the only way of reaching them.
    expect(normaliseStoredPhone(' +33 6 12 34 56 78 ')).toBe('+33 6 12 34 56 78')
  })
})
