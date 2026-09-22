import { describe, expect, it } from 'vitest'
import { paymentHeld, paymentTaken } from '@/modules/shop/lib/payment-taken'

// A refund moves payment_status on from PAID. Everything that asked "was this
// paid for?" must still answer yes afterwards, or a refund would take a sale out
// of the takings and let a replayed webhook pay the order again.

describe('paymentTaken', () => {
  it.each(['PAID', 'PARTIALLY_REFUNDED', 'REFUNDED'])('is true once %s', (status) => {
    expect(paymentTaken(status)).toBe(true)
  })

  it.each(['PENDING', 'AWAITING_CONFIRMATION', 'FAILED'])('is false while %s', (status) => {
    expect(paymentTaken(status)).toBe(false)
  })
})

describe('paymentHeld', () => {
  it.each(['PAID', 'PARTIALLY_REFUNDED'])('is true while %s', (status) => {
    expect(paymentHeld(status)).toBe(true)
  })

  it.each(['REFUNDED', 'PENDING', 'AWAITING_CONFIRMATION', 'FAILED'])('is false once %s', (status) => {
    expect(paymentHeld(status)).toBe(false)
  })
})
