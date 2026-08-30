import { describe, expect, it } from 'vitest'
import { refundNoticeText } from '@/modules/shop/lib/payments/refund-notice'

describe('refundNoticeText', () => {
  // The bug this replaced: any method not in the two-entry map was announced as
  // an automatic PayPal refund, whoever had actually taken the money.
  it('does not credit an unrelated method to PayPal', () => {
    expect(refundNoticeText('ATOA', { mode: 'manual', label: 'Pay by bank' })).not.toContain('PayPal')
    expect(refundNoticeText('GOCARDLESS_IBP', { mode: 'provider', label: 'Instant Bank Pay' })).not.toContain('PayPal')
  })

  it('says the money is the owner\'s to send for a manual provider', () => {
    const text = refundNoticeText('ATOA', { mode: 'manual', label: 'Pay by bank' })
    expect(text).toContain('yours to send')
    expect(text).not.toContain('automatically')
  })

  it('names the provider that will do it for an automatic one', () => {
    expect(refundNoticeText('SQUARE', { mode: 'provider', label: 'Square' })).toBe('This will be refunded automatically via Square.')
  })

  // Unchanged from the hardcoded map, deliberately: these two have had their own
  // wording for a while and it is better than any general rule.
  it('keeps the bank transfer and cash wording exactly as it was', () => {
    expect(refundNoticeText('BANK_TRANSFER', { mode: 'manual', label: 'Bank transfer' })).toContain('Nothing leaves your bank account by pressing this.')
    expect(refundNoticeText('CASH', { mode: 'manual', label: 'Cash' })).toContain('the cash itself is yours to hand back')
  })

  it('keeps the built-in wording even if the provider list cannot be read', () => {
    expect(refundNoticeText('CASH', null)).toContain('the cash itself is yours to hand back')
  })

  // Stripe and PayPal read exactly as they did before this existed.
  it('reproduces the old sentence for the two methods that were right', () => {
    expect(refundNoticeText('STRIPE', { mode: 'provider', label: 'Stripe' })).toBe('This will be refunded automatically via Stripe.')
    expect(refundNoticeText('PAYPAL', { mode: 'provider', label: 'PayPal' })).toBe('This will be refunded automatically via PayPal.')
  })

  it('promises nothing at all for a method with no provider registered', () => {
    const text = refundNoticeText('SOMETHING_UNINSTALLED', null)
    expect(text).not.toContain('automatically')
    expect(text).not.toContain('yours to send')
    expect(text).toContain('credit note')
  })
})
