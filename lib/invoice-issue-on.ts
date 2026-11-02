// When an order's invoice is raised automatically, and which orders a change to
// that setting applies to.
//
// Pure: no database, no clock of its own. lib/invoices.ts re-exports
// shouldIssueOn for the callers that raise invoices, and the settings route
// stamps a change through stampInvoiceIssueOnChange.
//
// A change to "Raise one when an order is" applies to orders placed AFTER it is
// saved. Orders already on the books keep the moment that was in force when they
// were placed. Their customers were told on the order page when their invoice
// would arrive ("on completion of your order"), and flipping the setting must
// not break that promise - nor quietly leave them with no invoice at all, which
// is what a plain switch from Completed to Paid used to do: the payment trigger
// had already been and gone for an order paid last week, and the completion
// trigger no longer counted, so it completed with nothing.
//
// Only the setting in force immediately before the latest change is kept. An
// order placed before two changes in a row follows the one before the latest,
// which is the price of not keeping a history of settings. Changing it twice in
// an afternoon is the case where that shows, and the button on the order screen
// raises any invoice by hand either way.

import type { ShpConfig } from '@/modules/shop/lib/config'

export type InvoiceIssueOn = ShpConfig['invoiceIssueOn']

/** The automatic triggers, plus the button and the reissue path. */
export type InvoiceTrigger = 'PAID' | 'DISPATCHED' | 'COMPLETED' | 'MANUAL' | 'REISSUE'

type IssueOnConfig = Pick<ShpConfig, 'invoiceIssueOn' | 'invoiceIssueOnPrevious' | 'invoiceIssueOnChangedAt'>

/** The moment this order's invoice is raised on: the setting in force when the
 *  order was placed. */
export function invoiceIssueOnForOrder(config: IssueOnConfig, order: { createdAt: Date | string }): InvoiceIssueOn {
  const changedAt = config.invoiceIssueOnChangedAt ? Date.parse(config.invoiceIssueOnChangedAt) : NaN
  const placedAt = new Date(order.createdAt).getTime()
  if (config.invoiceIssueOnPrevious && Number.isFinite(changedAt) && Number.isFinite(placedAt) && placedAt < changedAt) {
    return config.invoiceIssueOnPrevious
  }
  return config.invoiceIssueOn
}

/** Whether this transition should raise this order's invoice. Pure, so every
 *  caller agrees by construction rather than by all being right. */
export function shouldIssueOn(
  config: IssueOnConfig & Pick<ShpConfig, 'invoicesEnabled'>,
  trigger: InvoiceTrigger,
  order: { createdAt: Date | string },
): boolean {
  if (!config.invoicesEnabled) return false
  if (trigger === 'MANUAL') return true
  return invoiceIssueOnForOrder(config, order) === trigger
}

/**
 * Settles the two bookkeeping fields on a settings save. They are never taken
 * from the browser - whatever it sent for them is dropped - and are stamped here
 * only when the setting itself actually changes, so saving some other box on the
 * settings screen leaves them alone.
 */
export function stampInvoiceIssueOnChange<T extends Partial<IssueOnConfig>>(
  patch: T,
  current: Pick<ShpConfig, 'invoiceIssueOn'>,
  now: Date,
): T {
  const rest: T = { ...patch }
  delete rest.invoiceIssueOnPrevious
  delete rest.invoiceIssueOnChangedAt
  if (rest.invoiceIssueOn === undefined || rest.invoiceIssueOn === current.invoiceIssueOn) return rest
  return { ...rest, invoiceIssueOnPrevious: current.invoiceIssueOn, invoiceIssueOnChangedAt: now.toISOString() }
}
