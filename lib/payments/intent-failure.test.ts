import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  describeIntentFailure,
  INTENT_FAILURE_MESSAGE,
  intentFailureResponse,
  isShopperSafeError,
  shopperSafeError,
} from '@/modules/shop/lib/payments/intent-failure'

afterEach(() => vi.restoreAllMocks())

describe('describeIntentFailure', () => {
  it('passes on a message the provider wrote for the shopper', () => {
    const err = shopperSafeError('Pay by bank is only available for orders priced in GBP.')
    expect(describeIntentFailure(err)).toEqual({ status: 400, message: 'Pay by bank is only available for orders priced in GBP.' })
  })

  it('never shows a provider\'s raw error text', () => {
    const err = new Error('WorldFirst could not start the payment: key not found (KEY_NOT_FOUND)')
    expect(describeIntentFailure(err)).toEqual({ status: 503, message: INTENT_FAILURE_MESSAGE })
  })

  it('treats a thrown non-Error as a plain failure', () => {
    expect(describeIntentFailure('boom').status).toBe(503)
    expect(describeIntentFailure(undefined).message).toBe(INTENT_FAILURE_MESSAGE)
  })

  it('does not trust the flag unless it is exactly true on a real Error', () => {
    expect(isShopperSafeError(Object.assign(new Error('x'), { shopperSafe: 'yes' }))).toBe(false)
    expect(isShopperSafeError({ message: 'x', shopperSafe: true })).toBe(false)
    expect(isShopperSafeError(Object.assign(new Error('  '), { shopperSafe: true }))).toBe(false)
  })
})

describe('intentFailureResponse', () => {
  it('answers in JSON, logs the real error and keeps it out of the body', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const err = new Error('secret upstream detail')
    const res = intentFailureResponse('WORLDFIRST', err)
    expect(res.status).toBe(503)
    const body = await res.json()
    expect(body).toEqual({ error: INTENT_FAILURE_MESSAGE })
    expect(JSON.stringify(body)).not.toContain('secret')
    expect(log).toHaveBeenCalledWith(expect.stringContaining('WORLDFIRST'), err)
  })

  it('uses 400 and the provider\'s own words for a shopper-safe error', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = intentFailureResponse('ATOA', shopperSafeError('Too small.'))
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'Too small.' })
  })
})
