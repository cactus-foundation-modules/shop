// What a freshly paid order needs a person to look at, in words for the owner.
//
// Everything checkout promises about stock, pre-order limits and coupon limits
// is checked when the shopper starts paying, not when the money lands - and the
// money can land minutes later for a card or days later for a bank transfer.
// Two shoppers can both be told the last one is theirs. By the time the second
// payment arrives it has been taken, so refusing the order is no longer on the
// table; what is left is to say so plainly, at the one moment the shop can see
// it, instead of letting a counter quietly stop at nothing.
//
// Pure: lib/order-fulfillment.ts gathers the facts and writes the result as an
// internal note (and, where the order cannot simply be sent, a hold).

export type StockShortfall = { productName: string; ordered: number; inStock: number }
export type PreOrderOvershoot = { productName: string; count: number; limit: number }
export type CouponOveruse =
  | { kind: 'usage-limit'; code: string; limit: number }
  | { kind: 'per-customer'; code: string; limit: number; uses: number }

export type OrderAttention = { hold: boolean; note: string }

function times(n: number): string {
  return n === 1 ? 'once' : `${n} times`
}

export function fulfilmentAttention(input: {
  shortfalls: StockShortfall[]
  overshoots: PreOrderOvershoot[]
  coupon: CouponOveruse | null
}): OrderAttention | null {
  const paragraphs: string[] = []

  // Goods the shop does not have: held, because sending half an order or
  // promising a date nobody can meet is the owner's call, not the courier's.
  if (input.shortfalls.length > 0) {
    paragraphs.push(
      'Not enough stock when this order was paid for:\n' +
        input.shortfalls.map((s) => `- ${s.productName}: ${s.ordered} ordered, ${s.inStock} in stock`).join('\n') +
        '\nThe stock count has been taken down to nothing. Check you can supply this order before sending anything - if not, refund what cannot be sent.',
    )
  }

  if (input.overshoots.length > 0) {
    paragraphs.push(
      'More pre-orders were taken than the limit allows:\n' +
        input.overshoots.map((o) => `- ${o.productName}: ${o.count} on pre-order against a limit of ${o.limit}`).join('\n') +
        '\nCheck you can supply this order before promising the customer a date.',
    )
  }

  // A coupon used once too often is money, not goods: the order can still go
  // out, so it is noted rather than held.
  const coupon = input.coupon
  if (coupon?.kind === 'usage-limit') {
    paragraphs.push(
      `Coupon ${coupon.code} had already been used ${times(coupon.limit)}, its limit, when this order was paid for. ` +
        'The order still carries its discount - decide whether to honour it.',
    )
  } else if (coupon?.kind === 'per-customer') {
    paragraphs.push(
      `This customer has now used coupon ${coupon.code} on ${coupon.uses} paid orders, over its limit of ${coupon.limit} per customer - ` +
        'more than one checkout went through before either was paid. The order still carries its discount - decide whether to honour it.',
    )
  }

  if (paragraphs.length === 0) return null
  return {
    hold: input.shortfalls.length > 0 || input.overshoots.length > 0,
    note: paragraphs.join('\n\n'),
  }
}
