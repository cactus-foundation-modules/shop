// One payment method as the admin Payments tab needs to know it. Deliberately
// free of anything server-only (no provider functions, no credentials) so the
// settings screen can take it straight off the settings response. The one import
// is a type, so nothing of the provider module travels with it.
import type { ShpPaymentLogo } from '@/modules/shop/lib/payments/provider'
export type ShpAdminPaymentMethod = {
  /** Payment-method id as recorded on an order, e.g. "STRIPE", "GOCARDLESS_IBP". */
  id: string
  /** What the method is called on screen, straight from its provider. */
  label: string
  /**
   * The line the provider ships to go under that name at checkout, before the
   * owner has written anything of their own. Empty for a method that offers
   * none. Shown on the Payments tab as the placeholder in an empty box, so the
   * owner can see what their shoppers are reading without typing it out again.
   */
  defaultDescription: string
  /**
   * The brand mark this method ships, or null where it ships none. Sent so the
   * Payments tab can show the owner what they are switching on or off rather
   * than describing it, and so a method with no mark can skip the switch
   * entirely instead of offering one that does nothing.
   */
  logo: ShpPaymentLogo | null
  /** One of shop's own four, as against a method a module contributed. */
  builtIn: boolean
  /**
   * The method's own side of things is in place: keys entered for Stripe and
   * PayPal, and for a module method its own settings say it is connected and
   * switched on. Says nothing about shop's own on/off switch - that lives in
   * config (enabledPaymentMethods / disabledPaymentMethods), so a method can be
   * ready and switched off, or switched on and not ready yet.
   */
  ready: boolean
  /**
   * The settings-panel id the contributing module publishes into the Payments
   * tab, when it has one, so the method's row can point at its own panel. Null
   * for shop's own four (their settings are on this tab already) and for any
   * module whose panel id doesn't match its provider entry id.
   */
  panelId: string | null
}

// Which order the methods go in. Lives here, with no server imports of its own,
// so the settings screen and the checkout are working from one rule rather than
// two copies that drift: the screen cannot import shop config (it would drag
// Prisma into the browser bundle), and the config module imports these instead.

/**
 * The arrangement to sort by: the owner's, once they have made one on the
 * Payments tab. Until then the old behaviour stands - whatever order
 * enabledPaymentMethods happens to be in - so an existing shop's checkout does
 * not quietly reshuffle itself the day this arrives.
 */
export function resolvePaymentMethodOrder(
  config: { paymentMethodOrder: string[]; enabledPaymentMethods: string[] },
): string[] {
  return config.paymentMethodOrder.length > 0 ? config.paymentMethodOrder : config.enabledPaymentMethods
}

/**
 * Sorts ids into that arrangement. Anything it has never heard of - a method
 * from a module installed since - keeps its incoming position at the end rather
 * than jumping the queue, Array.prototype.sort being stable.
 */
export function sortPaymentMethods(ids: string[], order: string[]): string[] {
  if (order.length === 0) return ids
  const rank = new Map(order.map((id, i) => [id, i]))
  return [...ids].sort((a, b) => (rank.get(a) ?? Number.MAX_SAFE_INTEGER) - (rank.get(b) ?? Number.MAX_SAFE_INTEGER))
}

/** Whether the owner has this method switched on, before asking if it works. */
export function isPaymentMethodSwitchedOn(
  method: Pick<ShpAdminPaymentMethod, 'id' | 'builtIn'>,
  config: { enabledPaymentMethods: string[]; disabledPaymentMethods: string[] },
): boolean {
  if (config.disabledPaymentMethods.includes(method.id)) return false
  // A module method is on unless switched off: it arrived already knowing
  // whether it is set up, and never needed ticking here to work.
  return method.builtIn ? config.enabledPaymentMethods.includes(method.id) : true
}
