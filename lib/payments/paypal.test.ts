import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/modules/shop/lib/db/orders', () => ({ getOrderById: vi.fn() }))

import type { paypalProvider as PayPalProvider } from '@/modules/shop/lib/payments/paypal'
import { verifyOrderReceiptToken } from '@/modules/shop/lib/order-receipt-token'

const ORDER = {
  orderId: 'ord_123',
  orderNumber: 'DW000123',
  amount: 199.99,
  currency: 'GBP',
  customerEmail: 'buyer@example.com',
  customerName: 'A Buyer',
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

const token = () => json(200, { access_token: 'tok', expires_in: 3600 })

const CAPTURED = {
  status: 'COMPLETED',
  purchase_units: [{
    custom_id: 'ord_123',
    payments: { captures: [{ id: 'CAP1', amount: { value: '199.99', currency_code: 'GBP' } }] },
  }],
}

describe('PayPal provider', () => {
  let fetchMock: ReturnType<typeof vi.fn>
  // Loaded afresh for each test: the OAuth token is cached at module level,
  // and a token left over from one test would shift every mocked reply after it.
  let paypalProvider: typeof PayPalProvider

  beforeEach(async () => {
    vi.resetModules()
    ;({ paypalProvider } = await import('@/modules/shop/lib/payments/paypal'))
    vi.stubEnv('SITE_URL', 'https://shop.example.com/')
    vi.stubEnv('ENCRYPTION_KEY', 'test-key-test-key-test-key-test-key')
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  // The defect this covers: no return address at all, so PayPal had nowhere to
  // send an approved buyer and the payment was never captured.
  it('sends the buyer back to the signed confirmation page, and a cancel back to checkout', async () => {
    fetchMock
      .mockResolvedValueOnce(token())
      .mockResolvedValueOnce(json(201, { id: 'PP1', links: [{ rel: 'payer-action', href: 'https://paypal.test/approve' }] }))

    const intent = await paypalProvider.createIntent(ORDER)
    expect(intent).toEqual({ providerOrderId: 'PP1', approvalUrl: 'https://paypal.test/approve' })

    const sent = JSON.parse(fetchMock.mock.calls[1]![1].body as string)
    const ctx = sent.payment_source.paypal.experience_context
    expect(ctx.cancel_url).toBe('https://shop.example.com/shop/checkout')
    const back = new URL(ctx.return_url as string)
    expect(back.origin + back.pathname).toBe('https://shop.example.com/shop/checkout/confirmation')
    expect(back.searchParams.get('orderNumber')).toBe('DW000123')
    expect(back.searchParams.get('paypalReturn')).toBe('ord_123')
    expect(verifyOrderReceiptToken('DW000123', back.searchParams.get('t'))).toBe(true)
  })

  it('captures and reports the capture id', async () => {
    fetchMock.mockResolvedValueOnce(token()).mockResolvedValueOnce(json(201, CAPTURED))
    const result = await paypalProvider.confirmPayment(ORDER, { paypalOrderId: 'PP1' })
    expect(result).toEqual({ success: true, providerReference: 'CAP1' })
  })

  // A reload of the return page after the first capture's answer went missing.
  it('treats an order PayPal already captured as paid, after the same checks', async () => {
    fetchMock
      .mockResolvedValueOnce(token())
      .mockResolvedValueOnce(json(422, { name: 'UNPROCESSABLE_ENTITY', details: [{ issue: 'ORDER_ALREADY_CAPTURED' }] }))
      .mockResolvedValueOnce(json(200, CAPTURED))
    const result = await paypalProvider.confirmPayment(ORDER, { paypalOrderId: 'PP1' })
    expect(result).toEqual({ success: true, providerReference: 'CAP1' })
    expect(fetchMock.mock.calls[2]![1].method).toBe('GET')
  })

  // Refused is unpaid, never failed: the buyer can go back and pay another way.
  it('leaves a refused capture undeclined', async () => {
    fetchMock
      .mockResolvedValueOnce(token())
      .mockResolvedValueOnce(json(422, { name: 'UNPROCESSABLE_ENTITY', details: [{ issue: 'INSTRUMENT_DECLINED' }] }))
    const result = await paypalProvider.confirmPayment(ORDER, { paypalOrderId: 'PP1' })
    expect(result.success).toBe(false)
    expect(result.declined).toBeFalsy()
  })

  it('refuses a PayPal order id that is not one', async () => {
    const result = await paypalProvider.confirmPayment(ORDER, { paypalOrderId: '../refund' })
    expect(result.success).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
