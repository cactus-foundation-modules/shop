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
  it('leaves full-price lines out of the threshold, and takes nothing off them', () => {
    // A full-price item cannot stand in for offer items: the threshold is there
    // so the supplier's minimum is met by the offers alone. £220 of offers at
    // their reduced price, plus £200 at full price, has not reached £350.
    const short = applyOrderSizeDeduction(
      [
        line({ unitPrice: 116, quantity: 2, lineSubtotal: 232, deduction: 6 }),
        line({ unitPrice: 200, quantity: 1, lineSubtotal: 200, deduction: null }),
      ],
      [rule()],
    )
    expect(short.states[0]!.offerSubtotal).toBe(220)
    expect(short.states[0]!.qualified).toBe(false)
    expect(short.lines[0]!.unitPrice).toBe(116)

    // Enough offers on their own, and the full-price line rides along untouched.
    const { lines, states } = applyOrderSizeDeduction(
      [
        line({ unitPrice: 116, quantity: 4, lineSubtotal: 464, deduction: 6 }),
        line({ unitPrice: 200, quantity: 1, lineSubtotal: 200, deduction: null }),
      ],
      [rule()],
    )
    expect(states[0]!.offerSubtotal).toBe(440)
    expect(states[0]!.qualified).toBe(true)
    expect(lines[0]!.unitPrice).toBe(110)
    expect(lines[0]!.orderSizeDeduction).toBe(6)
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

  it('judges the threshold on the offer prices, not the shelf prices', () => {
    // £360 on the shelf, but £342 once the £6s are off - under £350, so nothing
    // comes off. Judged on the shelf price this basket would have qualified.
    const { lines, states } = applyOrderSizeDeduction(
      [line({ unitPrice: 120, quantity: 3, lineSubtotal: 360, deduction: 6 })],
      [rule()],
    )
    expect(states[0]!.offerSubtotal).toBe(342)
    expect(states[0]!.qualified).toBe(false)
    expect(states[0]!.shortfall).toBe(8)
    expect(lines[0]!.unitPrice).toBe(120)
  })

  it('refuses the basket that lost money on the supplier\'s minimum order', () => {
    // The order that prompted the rule: two cupboards and a pedestal, £415 on the
    // shelf against a £339 threshold, £295 once the £40s are off. Its purchase
    // order came to £271 against the supplier's £300 minimum, and the shop paid
    // the difference as a surcharge. Counted at offer prices it does not qualify.
    const { lines, states } = applyOrderSizeDeduction(
      [
        line({ unitPrice: 137, quantity: 2, lineSubtotal: 274, deduction: 40 }),
        line({ unitPrice: 141, quantity: 1, lineSubtotal: 141, deduction: 40 }),
      ],
      [rule({ threshold: 339 })],
    )
    expect(states[0]!.offerSubtotal).toBe(295)
    expect(states[0]!.qualified).toBe(false)
    expect(states[0]!.shortfall).toBe(44)
    expect(states[0]!.saving).toBe(120)
    expect(lines.every((l) => l.orderSizeDeduction === null)).toBe(true)
  })

  it('works the test out directly, so the same basket always gets the same answer', () => {
    // Exactly on the threshold at the reduced price qualifies, and applying the
    // rule to its own output answers the same way - a line's reduced value does
    // not depend on whether the basket qualified.
    const basket = [line({ unitPrice: 76, quantity: 5, lineSubtotal: 380, deduction: 6 })]
    const first = applyOrderSizeDeduction(basket, [rule()])
    expect(first.states[0]!.offerSubtotal).toBe(350)
    expect(first.states[0]!.qualified).toBe(true)
    expect(applyOrderSizeDeduction(basket, [rule()]).states).toEqual(first.states)
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
    // £432 on the line, £200 of it delivery: £232 of goods, £220 once the £6s
    // are off.
    expect(states[0]!.offerSubtotal).toBe(220)
    expect(states[0]!.qualified).toBe(false)
    expect(states[0]!.shortfall).toBe(130)
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
    expect(states[0]!.offerSubtotal).toBe(294)
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
    expect(dynamic.offerSubtotal).toBe(330)
    expect(dynamic.qualified).toBe(false)
    expect(furdeco.offerSubtotal).toBe(90)
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
  it('never takes anything off a line carrying no amount', () => {
    // The stamp is the whole test. A line without one is charged in full and
    // counts for nothing, so a basket of them has no standing at all.
    const { lines, states } = applyOrderSizeDeduction(
      [line({ unitPrice: 400, quantity: 1, lineSubtotal: 400, deduction: null })],
      [rule()],
    )
    expect(states).toEqual([])
    expect(lines[0]!.unitPrice).toBe(400)
    expect(lines[0]!.orderSizeDeduction).toBeNull()
  })

  it('takes the amount off a line that is not on offer', () => {
    // The whole reason this file stopped asking. An amount inside the ORDINARY
    // price is as ordinary as one inside a sale price, and refusing it forced a
    // shop to invent a sale the storefront then advertised as real.
    const { lines, states } = applyOrderSizeDeduction(
      [line({ unitPrice: 400, quantity: 1, lineSubtotal: 400, deduction: 30 })],
      [rule()],
    )
    expect(states[0]!.qualified).toBe(true)
    expect(states[0]!.saving).toBe(30)
    expect(lines[0]!.unitPrice).toBe(370)
    expect(lines[0]!.orderSizeDeduction).toBe(30)
  })

  it('never takes a line below zero', () => {
    // A mis-stamped row: the amount is worth more than the thing. Charge nothing,
    // never a negative - the admin report flags the row either way.
    const { lines } = applyOrderSizeDeduction(
      [line({ unitPrice: 4, quantity: 2, lineSubtotal: 8, deduction: 6 }), line({ unitPrice: 400, quantity: 1, lineSubtotal: 400, deduction: 6 })],
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
    expect(states).toEqual([])
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
      tail: ' when you spend £350 or more on Dynamic Office Solutions offer prices',
      text: 'Get it for just £116 £110 when you spend £350 or more on Dynamic Office Solutions offer prices',
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
      .toBe('Get it for just £110 when you spend £350 or more on Dynamic Office Solutions offer prices')

    expect(orderSizeDeductionRangeLine({ reducedPrice: 110, supplier: DYNAMIC, threshold: 350, currencySymbol: currency }))
      .toBe('Some options drop to £110 when you spend £350 or more on Dynamic Office Solutions offer prices')

    const short = orderSizeDeductionStates(
      [line({ unitPrice: 116, quantity: 4, lineSubtotal: 288, deduction: 6 })],
      [rule()],
    )[0]!
    // £288 of offers on the shelf, £264 once the £6s are off: £86 short.
    expect(short.shortfall).toBe(86)
    expect(short.saving).toBe(24)
    expect(orderSizeDeductionShortfallNote(short, currency))
      .toBe('Add £86 more of Dynamic Office Solutions offers and £24 comes off.')

    const over = orderSizeDeductionStates(
      [line({ unitPrice: 116, quantity: 4, lineSubtotal: 464, deduction: 6 })],
      [rule()],
    )[0]!
    expect(over.qualified).toBe(true)
    expect(orderSizeDeductionQualifiedNote(over, currency))
      .toBe('£24 has come off - your Dynamic Office Solutions offers are over £350.')
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
    // Nothing in the basket carries an amount, however much of it there is - and
    // being told to spend more to have nothing come off is worse than silence.
    for (const unitPrice of [400, 100]) {
      const nothing = orderSizeDeductionStates(
        [line({ unitPrice, quantity: 1, lineSubtotal: unitPrice, deduction: null })],
        [rule()],
      )
      expect(nothing).toEqual([])
      expect(orderSizeDeductionNotes(nothing, currency)).toEqual([])
    }

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
    expect(notes[1]!.text).toBe('Add £410 more of Furdeco offers and £10 comes off.')
  })
})

describe('orderSizeDeductionNotes - supplier links', () => {
  const currency = '£'
  const states = orderSizeDeductionStates(
    [
      line({ supplier: DYNAMIC, unitPrice: 116, quantity: 1, lineSubtotal: 116, deduction: 6 }),
      line({ supplier: 'Furdeco', unitPrice: 100, quantity: 1, lineSubtotal: 100, deduction: 10 }),
    ],
    [rule(), rule({ supplier: 'Furdeco', threshold: 500 })],
  )

  it('links only the suppliers whose page is published, by the name the sentence prints', () => {
    const notes = orderSizeDeductionNotes(states, currency, (name) =>
      name === DYNAMIC ? '/shop/suppliers/dynamic-office-solutions' : null,
    )
    expect(notes[0]!.link).toEqual({ name: DYNAMIC, href: '/shop/suppliers/dynamic-office-solutions' })
    expect(notes[0]!.text).toContain(notes[0]!.link!.name)
    expect(notes[1]!.link).toBeNull()
  })

  it('links nothing when no lookup is given', () => {
    expect(orderSizeDeductionNotes(states, currency).every((n) => n.link === null)).toBe(true)
  })
})
