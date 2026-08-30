// Which payment methods an order of THIS SIZE may be paid with.
//
// Every method the shop offers is offered to everybody, which is fine until two
// of them cost different amounts to run. A card fee is a percentage, an
// open-banking fee is often a flat one, and somewhere between the two there is a
// figure above which the shop would rather be paid one way and below which it
// would rather be paid the other. Some providers also have a ceiling of their
// own, and offering a shopper a method their bank will refuse at the last step
// is worse than never offering it.
//
// So each method gets an optional floor and an optional ceiling, both measured
// against WHAT THE CUSTOMER ACTUALLY PAYS: the order total, VAT and delivery
// included, after any discount. That is the figure the provider will be handed,
// which is the figure any rule about a provider should be about - and it is the
// one printed at the bottom of the order summary, so an owner setting the rule
// and a shopper reading the checkout are looking at the same number.
//
// Both ends are optional and unset by default, so a shop that has never opened
// the boxes behaves exactly as it always did.

/** The floor and ceiling for one method, in the shop's own currency, VAT and
 *  delivery included. `null` at either end means "no limit that way". */
export type ShpOrderValueLimit = {
  min: number | null
  max: number | null
}

/** method id -> its limits. Free-form keys, so a method contributed by a module
 *  installed later can be limited without shop knowing its name in advance. */
export type ShpOrderValueLimits = Record<string, ShpOrderValueLimit>

// Money is held as decimal pounds throughout the shop, and comparing decimal
// pounds as floats is how a £571.00 order ends up 0.0000001 over a £571 ceiling.
// Everything below compares whole pence instead.
function pence(amount: number): number {
  return Math.round(amount * 100)
}

/** The limits set for one method, or null where the owner has set neither end -
 *  which is every method until somebody opens the boxes. */
export function orderValueLimitFor(
  limits: ShpOrderValueLimits | undefined,
  method: string,
): ShpOrderValueLimit | null {
  const limit = limits?.[method]
  if (!limit) return null
  if (limit.min == null && limit.max == null) return null
  return limit
}

/**
 * Whether a method with these limits may be used for an order of this size.
 *
 * A total of `null` means nobody has worked one out yet - an early checkout with
 * no delivery address on it, a layout with no order summary to ask. That is not
 * grounds for hiding a method: the shopper is told what they can pay with, and
 * the server checks the rule again for real when the order is actually made. So
 * an unknown total allows everything.
 */
export function isWithinOrderValueLimit(
  limit: ShpOrderValueLimit | null,
  total: number | null,
): boolean {
  if (!limit) return true
  if (total == null || !Number.isFinite(total)) return true
  const value = pence(total)
  if (limit.min != null && value < pence(limit.min)) return false
  if (limit.max != null && value > pence(limit.max)) return false
  return true
}

/** The methods from `methods` that an order of this size may be paid with,
 *  in the order they were given in. */
export function filterMethodsByOrderValue(
  methods: readonly string[],
  limits: ShpOrderValueLimits | undefined,
  total: number | null,
): string[] {
  return methods.filter((method) => isWithinOrderValueLimit(orderValueLimitFor(limits, method), total))
}

/**
 * Why a method is not on offer, in the shopper's terms - "orders over £571.00"
 * rather than a pair of figures. Null where there is no rule to explain.
 *
 * Takes the already-formatted money rather than formatting it here, so the one
 * money formatter in the module stays the only one.
 */
export function orderValueLimitSentence(
  limit: ShpOrderValueLimit | null,
  format: (amount: number) => string,
): string | null {
  if (!limit) return null
  if (limit.min != null && limit.max != null) {
    return `orders from ${format(limit.min)} to ${format(limit.max)}`
  }
  if (limit.min != null) return `orders of ${format(limit.min)} and over`
  if (limit.max != null) return `orders up to ${format(limit.max)}`
  return null
}
