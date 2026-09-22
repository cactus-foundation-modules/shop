import { describe, expect, it, vi } from 'vitest'

// lib/config.ts reads the settings row through prisma at module scope; nothing
// here touches the database, so a stand-in is enough to import it.
vi.mock('@/lib/db/prisma', () => ({ prisma: {} }))

import { paymentInstructionsTooLong, PAYMENT_INSTRUCTIONS_MAX_LENGTH } from '@/modules/shop/lib/config'
import { ZonePostcodeList } from '@/modules/shop/lib/zone-postcode-list'
import {
  SHIPPING_ZONE_MAX_POSTCODES,
  SHIPPING_ZONE_POSTCODE_LINE_MAX_LENGTH,
  formatLimit,
} from '@/modules/shop/lib/admin-input-limits'

// Two ceilings whose failure would be quiet in opposite directions: a postcode
// list that stores a national paste without complaint, and a payment wording
// ceiling that - put in the wrong place - would stop a shop that already has
// long wording from saving anything at all.

describe('paymentInstructionsTooLong', () => {
  const long = 'x'.repeat(PAYMENT_INSTRUCTIONS_MAX_LENGTH + 1)
  const current = { bankTransferInstructions: '', cashInstructions: '' }

  it('lets wording up to the ceiling through', () => {
    expect(paymentInstructionsTooLong({ bankTransferInstructions: 'x'.repeat(PAYMENT_INSTRUCTIONS_MAX_LENGTH) }, current)).toBeNull()
  })

  it('refuses new wording past the ceiling, naming the box', () => {
    expect(paymentInstructionsTooLong({ bankTransferInstructions: long }, current)).toMatch(/^The bank transfer wording is too long/)
    expect(paymentInstructionsTooLong({ cashInstructions: long }, current)).toMatch(/^The cash wording is too long/)
  })

  it('never blocks a save because of wording already stored', () => {
    // The settings screen sends the whole config back, unchanged boxes included.
    const stored = { bankTransferInstructions: long, cashInstructions: '' }
    expect(paymentInstructionsTooLong({ ...stored, cashInstructions: 'Pay on collection.' }, stored)).toBeNull()
  })

  it('ignores a patch that does not mention either box', () => {
    expect(paymentInstructionsTooLong({}, current)).toBeNull()
  })
})

describe('ZonePostcodeList', () => {
  it('takes an ordinary mixed list of prefixes and ranges', () => {
    expect(ZonePostcodeList.safeParse(['SW', 'AB30-AB32', 'PO30-41', 'BT']).success).toBe(true)
  })

  it('takes a list right up to the ceiling', () => {
    const lines = Array.from({ length: SHIPPING_ZONE_MAX_POSTCODES }, (_, i) => `A${i}`)
    expect(ZonePostcodeList.safeParse(lines).success).toBe(true)
  })

  it('refuses a list past the ceiling in words', () => {
    const lines = Array.from({ length: SHIPPING_ZONE_MAX_POSTCODES + 1 }, (_, i) => `A${i}`)
    const result = ZonePostcodeList.safeParse(lines)
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.message).toContain(formatLimit(SHIPPING_ZONE_MAX_POSTCODES))
  })

  it('names the line that is too long', () => {
    const bad = 'Z'.repeat(SHIPPING_ZONE_POSTCODE_LINE_MAX_LENGTH + 1)
    const result = ZonePostcodeList.safeParse(['SW', bad])
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.message).toContain(bad)
  })
})
