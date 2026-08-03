import { describe, expect, it } from 'vitest'
import { isPaymentMethodSwitchedOn, resolvePaymentMethodOrder, sortPaymentMethods } from '@/modules/shop/lib/payments/admin-methods'

// These three decide what a shopper is offered and in what order, from both the
// settings screen and the checkout. Cheap to get subtly wrong, and nothing else
// in the suite would notice: a method quietly vanishing from checkout, or the
// order reshuffling itself on an existing shop, both still typecheck.

describe('resolvePaymentMethodOrder', () => {
  it('uses the owner arrangement once there is one', () => {
    expect(resolvePaymentMethodOrder({
      paymentMethodOrder: ['CASH', 'STRIPE'],
      enabledPaymentMethods: ['STRIPE', 'CASH'],
    })).toEqual(['CASH', 'STRIPE'])
  })

  it('falls back to the enabled list, which is the order checkout used before', () => {
    expect(resolvePaymentMethodOrder({
      paymentMethodOrder: [],
      enabledPaymentMethods: ['PAYPAL', 'STRIPE'],
    })).toEqual(['PAYPAL', 'STRIPE'])
  })
})

describe('sortPaymentMethods', () => {
  it('puts ids in the arranged order', () => {
    expect(sortPaymentMethods(['STRIPE', 'CASH', 'PAYPAL'], ['CASH', 'PAYPAL', 'STRIPE']))
      .toEqual(['CASH', 'PAYPAL', 'STRIPE'])
  })

  it('leaves ids the arrangement has never heard of on the end, in the order they came', () => {
    expect(sortPaymentMethods(['STRIPE', 'GOCARDLESS_IBP', 'SQUARE', 'CASH'], ['CASH', 'STRIPE']))
      .toEqual(['CASH', 'STRIPE', 'GOCARDLESS_IBP', 'SQUARE'])
  })

  it('changes nothing when no arrangement has been made', () => {
    expect(sortPaymentMethods(['STRIPE', 'CASH'], [])).toEqual(['STRIPE', 'CASH'])
  })
})

describe('isPaymentMethodSwitchedOn', () => {
  const stripe = { id: 'STRIPE', builtIn: true }
  const moduleMethod = { id: 'GOCARDLESS_IBP', builtIn: false }

  it('needs a built-in method to be listed', () => {
    expect(isPaymentMethodSwitchedOn(stripe, { enabledPaymentMethods: ['STRIPE'], disabledPaymentMethods: [] })).toBe(true)
    expect(isPaymentMethodSwitchedOn(stripe, { enabledPaymentMethods: [], disabledPaymentMethods: [] })).toBe(false)
  })

  it('leaves a module method on unless it has been switched off, as before', () => {
    expect(isPaymentMethodSwitchedOn(moduleMethod, { enabledPaymentMethods: [], disabledPaymentMethods: [] })).toBe(true)
  })

  it('lets the off switch beat everything', () => {
    expect(isPaymentMethodSwitchedOn(stripe, { enabledPaymentMethods: ['STRIPE'], disabledPaymentMethods: ['STRIPE'] })).toBe(false)
    expect(isPaymentMethodSwitchedOn(moduleMethod, { enabledPaymentMethods: ['GOCARDLESS_IBP'], disabledPaymentMethods: ['GOCARDLESS_IBP'] })).toBe(false)
  })
})
