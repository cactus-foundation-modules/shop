import { describe, expect, it } from 'vitest'
import {
  applyOrderSizeDeduction,
  deductionAmount,
  orderSizeDeductionLine,
  orderSizeDeductionNotes,
  orderSizeDeductionQualifiedNote,
  orderSizeDeductionRangeLine,
  orderSizeDeductionShortfallNote,
  orderSizeDeductionLineParts,
  orderSizeDeductionStates,
  tidyMoney,
  type OrderSizeDeductionLine,
  type OrderSizeDeductionRule,
} from '@/modules/shop/lib/order-size-deduction'

// The rule as a whole is commercial, not cosmetic: it decides what a shopper is
// charged. Every clause of it that could plausibly be got the other way round has
// a test here, because none of them would be caught by anything else - a basket
// that quietly deducts a pound too much still typechecks, still lints, and still
// looks entirely correct on screen.

const DYNAMIC = 'Dynamic Office Solutions'
const rule = (over: Partial<OrderSizeDeductionRule> = {}): OrderSizeDeductionRule => ({
  supplier: DYNAMIC,
  threshold: 350,
  note: null,
  ...over,
})

const line = (over: Partial<OrderSizeDeductionLine> = {}): OrderSizeDeductionLine => {
  const unitPrice = over.unitPrice ?? 116
  const quantity = over.quantity ?? 1
  return {
    supplier: DYNAMIC,
    unitPrice,
    quantity,
    lineSubtotal: unitPrice * quantity,
    charges: null,
    deduction: 6,
    onOffer: true,
    ...over,
  }
}

describe('deductionAmount', () => {
  it('reads a stored figure, and treats every kind of nothing as nothing', () => {
    expect(deductionAmount(6)).toBe(6)
    expect(deductionAmount('6.00')).toBe(6)
    expect(deductionAmount(6.005)).toBe(6.01)
    // Null and a recorded 0 mean different things to an owner and the same thing
    // here: neither takes any money off.
    expect(deductionAmount(null)).toBeNull()
    expect(deductionAmount(undefined)).toBeNull()
    expect(deductionAmount(0)).toBeNull()
    expect(deductionAmount('0')).toBeNull()
    expect(deductionAmount('')).toBeNull()
    // A negative would ADD money to a price, which this feature may never do.
    expect(deductionAmount(-6)).toBeNull()
    expect(deductionAmount(Number.NaN)).toBeNull()
    expect(deductionAmount('not a number')).toBeNull()
    expect(deductionAmount(Number.POSITIVE_INFINITY)).toBeNull()
  })
})

describe('the qualifying subtotal', () => {
  it('counts full-price lines towards the threshold, and takes nothing off them', () => {
    // The asymmetry that IS the feature: a full-price chair from the same
    // supplier helps the basket over the line and is charged in full.
    const { lines, states } = applyOrderSizeDeduction(
      [
        line({ unitPrice: 116, quantity: 2, lineSubtotal: 232, deduction: 6 }),
        line({ unitPrice: 200, quantity: 1, lineSubtotal: 200, deduction: null }),
      ],
      [rule()],
    )
    expect(states[0]!.goodsSubtotal).toBe(432)
    expect(states[0]!.qualified).toBe(true)
    expect(lines[0]!.unitPrice).toBe(110)
    expect(lines[0]!.orderSizeDeduction).toBe(6)
    // Untouched, and no note that it lost anything.
    expect(lines[1]!.unitPrice).toBe(200)
    expect(lines[1]!.orderSizeDeduction).toBeNull()
  })

  it('deducts per unit, not per line', () => {
    const { lines, states } = applyOrderSizeDeduction(
      [line({ unitPrice: 116, quantity: 5, lineSubtotal: 580, deduction: 6 })],
      [rule()],
    )
    expect(lines[0]!.unitPrice).toBe(110)
    expect(lines[0]!.lineSubtotal).toBe(550)
    // Five chairs at £6 is £30, not £6.
    expect(states[0]!.saving).toBe(30)
  })

  it('judges qualification BEFORE the money comes off, so a basket cannot oscillate', () => {
    // £354 of goods clears £350. Take £6 x 1 off and it is £348 - under the
    // threshold. Judged pre-deduction, so it keeps what it earned; judged after,
    // this basket would flip between qualified and not for ever.
    const { lines, states } = applyOrderSizeDeduction(
      [
        line({ unitPrice: 116, quantity: 1, lineSubtotal: 116, deduction: 6 }),
        line({ unitPrice: 238, quantity: 1, lineSubtotal: 238, deduction: null }),
      ],
      [rule()],
    )
    expect(states[0]!.goodsSubtotal).toBe(354)
    expect(states[0]!.qualified).toBe(true)
    expect(lines[0]!.unitPrice).toBe(110)
    expect(lines[0]!.lineSubtotal + lines[1]!.lineSubtotal).toBe(348)
  })

  it('leaves a resolver\'s named charges out of the qualifying subtotal', () => {
    // A REAL charge, not a zero one: advanced-shipping's delivery money is inside
    // unitPrice on live baskets today, attributed back out as a named charge, and
    // a subtotal that counted it would clear thresholds the goods never reached.
    const { states } = applyOrderSizeDeduction(
      [
        line({
          unitPrice: 216,
          quantity: 2,
          lineSubtotal: 432,
          charges: [{ label: 'Delivery', amount: 200 }],
          deduction: 6,
        }),
      ],
      [rule()],
    )
    // £432 on the line, £200 of it delivery: £232 of goods.
    expect(states[0]!.goodsSubtotal).toBe(232)
    expect(states[0]!.qualified).toBe(false)
    expect(states[0]!.shortfall).toBe(118)
  })

  it('refuses a basket that clears the threshold only because of delivery', () => {
    const { lines, states } = applyOrderSizeDeduction(
      [
        line({
          unitPrice: 360,
          quantity: 1,
          lineSubtotal: 360,
          charges: [{ label: 'Delivery', amount: 60 }],
          deduction: 6,
        }),
      ],
      [rule()],
    )
    expect(states[0]!.goodsSubtotal).toBe(300)
    expect(states[0]!.qualified).toBe(false)
    expect(lines[0]!.unitPrice).toBe(360)
    expect(lines[0]!.orderSizeDeduction).toBeNull()
  })

  it('scores suppliers separately, and never counts a line with no supplier', () => {
    const rules = [rule(), rule({ supplier: 'Furdeco', threshold: 500 })]
    const { lines, states } = applyOrderSizeDeduction(
      [
        line({ supplier: DYNAMIC, unitPrice: 116, quantity: 3, lineSubtotal: 348, deduction: 6 }),
        line({ supplier: 'Furdeco', unitPrice: 100, quantity: 1, lineSubtotal: 100, deduction: 10 }),
        line({ supplier: null, unitPrice: 400, quantity: 1, lineSubtotal: 400, deduction: 40 }),
      ],
      rules,
    )
    const dynamic = states.find((s) => s.supplier === DYNAMIC)!
    const furdeco = states.find((s) => s.supplier === 'Furdeco')!
    // Neither supplier gets the other's money, and the £400 supplier-less line
    // is in nobody's sum.
    expect(dynamic.goodsSubtotal).toBe(348)
    expect(dynamic.qualified).toBe(false)
    expect(furdeco.goodsSubtotal).toBe(100)
    expect(furdeco.qualified).toBe(false)
    expect(lines.every((l) => l.orderSizeDeduction === null)).toBe(true)
  })

  it('says nothing at all about a supplier with no rule', () => {
    const { lines, states } = applyOrderSizeDeduction(
      [line({ supplier: 'Somebody Else', unitPrice: 500, quantity: 1, lineSubtotal: 500, deduction: 6 })],
      [rule()],
    )
    expect(states).toEqual([])
    expect(lines[0]!.orderSizeDeduction).toBeNull()
  })

  it('matches a supplier name regardless of case and stray spacing', () => {
    // shp_suppliers.name is unique case-insensitively and products point at it by
    // name, so the join has to be as forgiving as the index is.
    const { lines } = applyOrderSizeDeduction(
      [line({ supplier: '  dynamic office solutions ', unitPrice: 400, quantity: 1, lineSubtotal: 400 })],
      [rule()],
    )
    expect(lines[0]!.orderSizeDeduction).toBe(6)
  })
})

describe('which lines actually lose money', () => {
  it('never takes anything off a line that is not currently on offer', () => {
    // A sale that has ended leaves the stamped amount behind. Deducting it would
    // take money off a full price nobody built it into.
    const { lines, states } = applyOrderSizeDeduction(
      [line({ unitPrice: 400, quantity: 1, lineSubtotal: 400, deduction: 6, onOffer: false })],
      [rule()],
    )
    expect(states[0]!.qualified).toBe(true)
    expect(states[0]!.saving).toBe(0)
    expect(lines[0]!.unitPrice).toBe(400)
    expect(lines[0]!.orderSizeDeduction).toBeNull()
  })

  it('never takes a line below zero', () => {
    // A mis-stamped row: the amount is worth more than the thing. Charge nothing,
    // never a negative - the admin report flags the row either way.
    const { lines } = applyOrderSizeDeduction(
      [line({ unitPrice: 4, quantity: 2, lineSubtotal: 8, deduction: 6 }), line({ unitPrice: 400, quantity: 1, lineSubtotal: 400, deduction: null })],
      [rule()],
    )
    expect(lines[0]!.unitPrice).toBe(0)
    expect(lines[0]!.lineSubtotal).toBe(0)
    expect(lines[0]!.orderSizeDeduction).toBe(4)
  })

  it('ignores a nil, zero, negative or unreadable stored amount', () => {
    const { lines, states } = applyOrderSizeDeduction(
      [
        line({ unitPrice: 100, quantity: 1, lineSubtotal: 100, deduction: null }),
        line({ unitPrice: 100, quantity: 1, lineSubtotal: 100, deduction: 0 }),
        line({ unitPrice: 100, quantity: 1, lineSubtotal: 100, deduction: -6 }),
        line({ unitPrice: 100, quantity: 1, lineSubtotal: 100, deduction: Number.NaN }),
      ],
      [rule()],
    )
    expect(states[0]!.qualified).toBe(true)
    expect(states[0]!.saving).toBe(0)
    expect(lines.every((l) => l.unitPrice === 100 && l.orderSizeDeduction === null)).toBe(true)
  })

  it('leaves the basket alone when there are no rules at all', () => {
    const { lines, states } = applyOrderSizeDeduction([line({ unitPrice: 400, quantity: 1, lineSubtotal: 400 })], [])
    expect(states).toEqual([])
    expect(lines[0]!.unitPrice).toBe(400)
  })
})

describe('the copy', () => {
  const currency = '£'

  it('breaks the line into the parts a renderer dresses, on both wordings', () => {
    expect(orderSizeDeductionLineParts({
      reducedPrice: 110, currentPrice: 116, supplier: DYNAMIC, threshold: 350, currencySymbol: currency,
    })).toEqual({
      lead: 'Get it for just ',
      was: '£116',
      now: '£110',
      tail: ' on Dynamic Office Solutions orders of £350 or more',
      text: 'Get it for just £116 £110 on Dynamic Office Solutions orders of £350 or more',
    })

    expect(orderSizeDeductionLineParts({
      reducedPrice: 110, currentPrice: 116, supplier: DYNAMIC, threshold: 350, currencySymbol: currency, someOptionsOnly: true,
    }).lead).toBe('Some options drop to ')
  })

  it('strikes nothing through when there is no better price to show', () => {
    // No current price given, or one that does not actually beat the reduced
    // figure: a line through a number equal to the one beside it would be a
    // claim about a saving that is not there.
    expect(orderSizeDeductionLineParts({ reducedPrice: 110, supplier: DYNAMIC, threshold: 350, currencySymbol: currency }).was).toBeNull()
    expect(orderSizeDeductionLineParts({ reducedPrice: 110, currentPrice: 110, supplier: DYNAMIC, threshold: 350, currencySymbol: currency }).was).toBeNull()
    expect(orderSizeDeductionLineParts({ reducedPrice: 110, currentPrice: 90, supplier: DYNAMIC, threshold: 350, currencySymbol: currency }).was).toBeNull()
    // Two figures that format identically are one price wearing two labels.
    expect(orderSizeDeductionLineParts({ reducedPrice: 110, currentPrice: 110.001, supplier: DYNAMIC, threshold: 350, currencySymbol: currency }).was).toBeNull()
  })

  it('prints whole pounds bare and pence only where there are any', () => {
    expect(tidyMoney(350, currency)).toBe('£350')
    expect(tidyMoney(116.5, currency)).toBe('£116.50')
    expect(tidyMoney(1600, currency)).toBe('£1,600')
  })

  it('says it the four approved ways', () => {
    expect(orderSizeDeductionLine({ reducedPrice: 110, supplier: DYNAMIC, threshold: 350, currencySymbol: currency }))
      .toBe('Get it for just £110 on Dynamic Office Solutions orders of £350 or more')

    expect(orderSizeDeductionRangeLine({ reducedPrice: 110, supplier: DYNAMIC, threshold: 350, currencySymbol: currency }))
      .toBe('Some options drop to £110 on Dynamic Office Solutions orders of £350 or more')

    const short = orderSizeDeductionStates(
      [line({ unitPrice: 116, quantity: 4, lineSubtotal: 288, deduction: 6 })],
      [rule()],
    )[0]!
    expect(short.shortfall).toBe(62)
    expect(short.saving).toBe(24)
    expect(orderSizeDeductionShortfallNote(short, currency))
      .toBe('Add £62 more from Dynamic Office Solutions and save £24.')

    const over = orderSizeDeductionStates(
      [line({ unitPrice: 116, quantity: 4, lineSubtotal: 464, deduction: 6 })],
      [rule()],
    )[0]!
    expect(over.qualified).toBe(true)
    expect(orderSizeDeductionQualifiedNote(over, currency))
      .toBe('£24 has come off this order - your Dynamic Office Solutions items are over £350.')
  })

  it('never mentions a discount, a saving, carriage or delivery', () => {
    const states = orderSizeDeductionStates(
      [line({ unitPrice: 116, quantity: 4, lineSubtotal: 288, deduction: 6 })],
      [rule()],
    )
    const wording = [
      ...orderSizeDeductionNotes(states, currency).map((n) => n.text),
      orderSizeDeductionLine({ reducedPrice: 110, supplier: DYNAMIC, threshold: 350, currencySymbol: currency }),
      orderSizeDeductionRangeLine({ reducedPrice: 110, supplier: DYNAMIC, threshold: 350, currencySymbol: currency }),
    ].join(' ').toLowerCase()
    for (const banned of ['discount', 'saving', 'carriage', 'delivery', 'postage', 'shipping']) {
      expect(wording).not.toContain(banned)
    }
  })

  it('stays quiet when there is nothing worth saying', () => {
    // Qualified, but nothing in the basket carries an amount.
    const nothingToTake = orderSizeDeductionStates(
      [line({ unitPrice: 400, quantity: 1, lineSubtotal: 400, deduction: null })],
      [rule()],
    )
    expect(nothingToTake[0]!.qualified).toBe(true)
    expect(orderSizeDeductionNotes(nothingToTake, currency)).toEqual([])

    // Short, but of a supplier the shopper has no carrying items from - being
    // told to spend another £62 to save nothing is worse than being told nothing.
    const nothingToGain = orderSizeDeductionStates(
      [line({ unitPrice: 100, quantity: 1, lineSubtotal: 100, deduction: null })],
      [rule()],
    )
    expect(nothingToGain[0]!.qualified).toBe(false)
    expect(orderSizeDeductionNotes(nothingToGain, currency)).toEqual([])

    // And no rules at all.
    expect(orderSizeDeductionNotes(orderSizeDeductionStates([line()], []), currency)).toEqual([])
  })

  it('gives one note per supplier, keyed so the basket can render a list', () => {
    const states = orderSizeDeductionStates(
      [
        line({ supplier: DYNAMIC, unitPrice: 116, quantity: 4, lineSubtotal: 464, deduction: 6 }),
        line({ supplier: 'Furdeco', unitPrice: 100, quantity: 1, lineSubtotal: 100, deduction: 10 }),
      ],
      [rule(), rule({ supplier: 'Furdeco', threshold: 500 })],
    )
    const notes = orderSizeDeductionNotes(states, currency)
    expect(notes).toHaveLength(2)
    expect(notes.map((n) => n.id)).toEqual([
      'shop-order-size-deduction:Dynamic Office Solutions',
      'shop-order-size-deduction:Furdeco',
    ])
    expect(notes[1]!.text).toBe('Add £400 more from Furdeco and save £10.')
  })
})
