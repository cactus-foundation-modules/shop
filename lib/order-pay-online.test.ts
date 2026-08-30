import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { ShpPaymentProvider } from '@/modules/shop/lib/payments/provider'

// What is being pinned here is a set of judgements about MONEY THAT IS STILL
// OWED - which order may be paid again, by what, and which method the page
// should be speaking about while it happens. Every one of them has a way of
// being wrong that costs somebody something: an order paid twice, an order with
// no way left to pay it at all, or a set of bank details that quietly vanished
// from under a customer halfway through.

const availableMethods = vi.hoisted(() => vi.fn())
const providers = vi.hoisted(() => vi.fn())

vi.mock('@/modules/shop/lib/config', () => ({
  getShopConfigCached: vi.fn(),
  getAvailablePaymentMethods: availableMethods,
  // Only assertPayableOnline reaches for this, and only to word a refusal these
  // tests never ask for - but a missing export is a missing export.
  orderValueRefusal: vi.fn(async () => null),
}))

vi.mock('@/modules/shop/lib/payments/registry', () => ({
  getAllPaymentProviders: providers,
  getPaymentProvider: (id: string) => (providers() as ShpPaymentProvider[]).find((p) => p.id === id),
  resolveProviderLabel: async (p: ShpPaymentProvider) => p.label,
  resolvePaymentMethodDescriptions: () => ({}),
}))

const { settlementMethod, orderAcceptsOnlinePayment, payOnlineMethodsForOrder } =
  await import('@/modules/shop/lib/order-pay-online')

function provider(id: string, extra: Partial<ShpPaymentProvider> = {}): ShpPaymentProvider {
  return {
    id,
    label: id,
    createIntent: async () => ({}),
    confirmPayment: async () => ({ success: false }),
    refundOrder: async () => ({ success: false }),
    ...extra,
  }
}

const BANK = provider('BANK_TRANSFER', { confirmMode: 'manual' })
const SQUARE = provider('SQUARE', { confirmMode: 'auto', settlesExistingOrder: true })
const GOCARDLESS = provider('GOCARDLESS_IBP', { confirmMode: 'auto', settlesExistingOrder: true })
// Automated, offered at checkout, and has never claimed it can take money for an
// order that already exists. It must never appear on an order page.
const STRIPE = provider('STRIPE', { confirmMode: 'auto' })

const config = { payOnlineOnOrderPage: true, paymentMethodDescriptions: {}, hiddenPaymentMethodLogos: [] }
// The narrow slice of ShpConfig these functions actually read, not a whole one.
const asConfig = (over: Record<string, unknown> = {}) =>
  ({ ...config, ...over }) as unknown as Parameters<typeof orderAcceptsOnlinePayment>[1]

const unpaidBankTransfer = {
  status: 'PENDING' as const,
  paymentStatus: 'AWAITING_CONFIRMATION' as const,
  paymentMethod: 'BANK_TRANSFER',
  originalPaymentMethod: null,
  // Only the per-method size limits read this, and the config these tests hand
  // in sets none - so any figure does, as long as there is one.
  total: '250.00',
}

beforeEach(() => {
  providers.mockReturnValue([STRIPE, BANK, SQUARE, GOCARDLESS])
  availableMethods.mockResolvedValue(['BANK_TRANSFER', 'SQUARE', 'GOCARDLESS_IBP', 'STRIPE'])
})

describe('settlementMethod', () => {
  it('is the order own method where nothing has ever changed it', () => {
    expect(settlementMethod(unpaidBankTransfer)).toBe('BANK_TRANSFER')
  })

  it('is the method it was PLACED with while the money is still owed', () => {
    // The customer started a card payment here and thought better of it. Their
    // bank details have to still be on the page.
    expect(settlementMethod({ ...unpaidBankTransfer, paymentMethod: 'SQUARE', originalPaymentMethod: 'BANK_TRANSFER' }))
      .toBe('BANK_TRANSFER')
  })

  it('is the method that actually paid, once something has', () => {
    expect(settlementMethod({
      status: 'PROCESSING', paymentStatus: 'PAID', paymentMethod: 'SQUARE', originalPaymentMethod: 'BANK_TRANSFER',
      total: '250.00',
    })).toBe('SQUARE')
  })
})

describe('orderAcceptsOnlinePayment', () => {
  it('says yes to an unpaid order on a method somebody has to go and act on', async () => {
    await expect(orderAcceptsOnlinePayment(unpaidBankTransfer, asConfig())).resolves.toBe(true)
  })

  it('says no when the owner has switched the offer off', async () => {
    await expect(orderAcceptsOnlinePayment(unpaidBankTransfer, asConfig({ payOnlineOnOrderPage: false })))
      .resolves.toBe(false)
  })

  it('says no once the money has arrived', async () => {
    await expect(orderAcceptsOnlinePayment(
      { ...unpaidBankTransfer, paymentStatus: 'PAID' }, asConfig(),
    )).resolves.toBe(false)
  })

  it('says no on a cancelled order, which would otherwise sit unpaid for ever', async () => {
    await expect(orderAcceptsOnlinePayment(
      { ...unpaidBankTransfer, status: 'CANCELLED' }, asConfig(),
    )).resolves.toBe(false)
  })

  it('says no on an automated method still settling - a second payment is a double charge', async () => {
    await expect(orderAcceptsOnlinePayment(
      { ...unpaidBankTransfer, paymentMethod: 'SQUARE' }, asConfig(),
    )).resolves.toBe(false)
  })

  it('still says yes after an abandoned attempt moved the order method on', async () => {
    await expect(orderAcceptsOnlinePayment(
      { ...unpaidBankTransfer, paymentMethod: 'SQUARE', originalPaymentMethod: 'BANK_TRANSFER' }, asConfig(),
    )).resolves.toBe(true)
  })
})

describe('payOnlineMethodsForOrder', () => {
  it('offers only automated methods that have said they can settle an existing order', async () => {
    const methods = await payOnlineMethodsForOrder(unpaidBankTransfer, asConfig())
    expect(methods.map((m) => m.id)).toEqual(['SQUARE', 'GOCARDLESS_IBP'])
  })

  it('keeps the order the owner arranged the methods in', async () => {
    availableMethods.mockResolvedValue(['GOCARDLESS_IBP', 'BANK_TRANSFER', 'SQUARE', 'STRIPE'])
    const methods = await payOnlineMethodsForOrder(unpaidBankTransfer, asConfig())
    expect(methods.map((m) => m.id)).toEqual(['GOCARDLESS_IBP', 'SQUARE'])
  })

  it('leaves out a method the owner has switched off, however willing it is', async () => {
    availableMethods.mockResolvedValue(['BANK_TRANSFER', 'GOCARDLESS_IBP'])
    const methods = await payOnlineMethodsForOrder(unpaidBankTransfer, asConfig())
    expect(methods.map((m) => m.id)).toEqual(['GOCARDLESS_IBP'])
  })

  it('never offers the method the order was placed with back to itself', async () => {
    const methods = await payOnlineMethodsForOrder(
      { ...unpaidBankTransfer, paymentMethod: 'GOCARDLESS_IBP', originalPaymentMethod: 'BANK_TRANSFER' },
      asConfig(),
    )
    // BANK_TRANSFER is what it was placed on, so it is not on offer - but the
    // half-finished GoCardless attempt is perfectly fine to start again.
    expect(methods.map((m) => m.id)).toEqual(['SQUARE', 'GOCARDLESS_IBP'])
  })

  it('leaves out a method this order is too small for', async () => {
    // The £571 rule the shop set at checkout holds here too: a £250 order is
    // below GoCardless's floor, so settling it that way was never on offer.
    const methods = await payOnlineMethodsForOrder(
      unpaidBankTransfer,
      asConfig({ paymentMethodOrderValueLimits: { GOCARDLESS_IBP: { min: 571.01, max: null } } }),
    )
    expect(methods.map((m) => m.id)).toEqual(['SQUARE'])
  })

  it('offers it again once the order is big enough', async () => {
    const methods = await payOnlineMethodsForOrder(
      { ...unpaidBankTransfer, total: '600.00' },
      asConfig({ paymentMethodOrderValueLimits: { GOCARDLESS_IBP: { min: 571.01, max: null } } }),
    )
    expect(methods.map((m) => m.id)).toEqual(['SQUARE', 'GOCARDLESS_IBP'])
  })

  it('offers nothing at all on a settled order', async () => {
    const methods = await payOnlineMethodsForOrder({ ...unpaidBankTransfer, paymentStatus: 'PAID' }, asConfig())
    expect(methods).toEqual([])
  })
})
