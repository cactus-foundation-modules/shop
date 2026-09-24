import { describe, expect, it } from 'vitest'
import {
  MARKETING_CONSENT_AGREEMENT_ID,
  latestMarketingConsent,
  marketingConsentFromAgreements,
} from '@/modules/shop/lib/marketing-consent'

describe('marketingConsentFromAgreements', () => {
  it('reads a recorded yes and a recorded no as they are', () => {
    expect(marketingConsentFromAgreements({ [MARKETING_CONSENT_AGREEMENT_ID]: true })).toBe(true)
    expect(marketingConsentFromAgreements({ [MARKETING_CONSENT_AGREEMENT_ID]: false })).toBe(false)
  })

  it('reads nothing as null, never as a no', () => {
    expect(marketingConsentFromAgreements(undefined)).toBeNull()
    expect(marketingConsentFromAgreements({})).toBeNull()
    expect(marketingConsentFromAgreements({ terms: true })).toBeNull()
  })

  it('ignores a value that is not a boolean', () => {
    const forged = { [MARKETING_CONSENT_AGREEMENT_ID]: 'yes' } as unknown as Record<string, boolean>
    expect(marketingConsentFromAgreements(forged)).toBeNull()
  })
})

describe('latestMarketingConsent', () => {
  const mine = 'shopper@example.com'

  it('takes the newest order that carries an answer', () => {
    const orders = [
      { customerEmail: mine, marketingConsent: null },
      { customerEmail: mine, marketingConsent: false },
      { customerEmail: mine, marketingConsent: true },
    ]
    expect(latestMarketingConsent(orders, mine)).toBe(false)
  })

  it('does not let a newer silent order undo an older answer', () => {
    expect(latestMarketingConsent([{ customerEmail: mine, marketingConsent: null }, { customerEmail: mine, marketingConsent: true }], mine)).toBe(true)
  })

  it('matches the address regardless of case and stray spaces', () => {
    expect(latestMarketingConsent([{ customerEmail: ' Shopper@Example.COM ', marketingConsent: true }], mine)).toBe(true)
  })

  it('ignores an order placed for somebody else\'s address', () => {
    const orders = [
      { customerEmail: 'friend@example.com', marketingConsent: false },
      { customerEmail: mine, marketingConsent: true },
    ]
    expect(latestMarketingConsent(orders, mine)).toBe(true)
  })

  it('answers null when nothing qualifies', () => {
    expect(latestMarketingConsent([], mine)).toBeNull()
    expect(latestMarketingConsent([{ customerEmail: 'friend@example.com', marketingConsent: true }], mine)).toBeNull()
  })
})
