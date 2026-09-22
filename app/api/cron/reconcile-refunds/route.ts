import { NextRequest, NextResponse } from 'next/server'
import { errorResponse } from '@/lib/utils'
import { reconcileStaleRefunds } from '@/modules/shop/lib/db/refunds'
import { getPaymentProvider } from '@/modules/shop/lib/payments/registry'
import { getShopConfigCached } from '@/modules/shop/lib/config'
import { creditNoteForSettledRefund } from '@/modules/shop/lib/credit-notes'
import { sendEmail } from '@/lib/email'
import { escapeHtml } from '@/lib/email/blocks'
import { prisma } from '@/lib/db/prisma'
import { upsertAlert, clearAlert } from '@/lib/notifications/alerts'

// Hourly. Resolves refunds left PENDING by a request that died between issuing
// the provider call and recording its outcome - the price of not holding a
// database connection open across that call.
//
// It never decides what happened on its own: the provider is asked, and anything
// short of a definite answer is left alone and reported. Money is only ever
// recorded as moved on the provider's own word.
//
// Hourly in cactus.module.json too, which it was not: the schedule said once a
// day while everything here said hourly, so a refund stranded at nine in the
// morning sat unresolved - its units still counted as bought, no credit note,
// its amount held against the order - until half past six the next day.
//
// What the owner is TOLD follows what changed, not the clock. A refund nobody
// can resolve is still unresolved an hour later, and an hourly email about the
// same one would be noise - so the list lives as one rolling alert in the admin
// bell (STALE_REFUNDS_ALERT), and the email goes only when the list is new or
// different from the one already standing. That used to be "the run at six
// o'clock UTC", which any change to this job's frequency on the Schedules page,
// or a run pushed past the hour, silently turned into never. A manual refund set
// aside is different: it leaves PENDING on the run that finds it and is never
// seen again, so it is told once, straight away.
const STALE_REFUNDS_ALERT = 'shop:stale-refunds'

// The alert's title names the orders, so a different set of stuck refunds is a
// different title - which is both what re-lights the bell and how this run knows
// the owner has not yet been emailed about this list.
function staleRefundsTitle(orderNumbers: string[]): string {
  const unique = [...new Set(orderNumbers)].sort()
  const shown = unique.slice(0, 5).join(', ')
  const more = unique.length > 5 ? ` and ${unique.length - 5} more` : ''
  return `${orderNumbers.length} ${orderNumbers.length === 1 ? 'refund needs' : 'refunds need'} checking by hand: ${shown}${more}`
}

async function handle(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) return errorResponse('CRON_SECRET is not configured', 503)
  const auth = request.headers.get('authorization')
  if (auth !== `Bearer ${secret}`) return errorResponse('Unauthorized', 401)

  let outcomes
  try {
    outcomes = await reconcileStaleRefunds((providerId) => getPaymentProvider(providerId) ?? null)
  } catch (err) {
    // Caught and reported rather than thrown. An uncaught error here is masked by the
    // framework into a bare "Internal Server Error", so core's cron dispatcher records
    // "HTTP 500" and the owner is told an hourly job failed with no hint as to why -
    // which is how a query naming a column that has never existed ran unnoticed.
    return errorResponse(err instanceof Error ? err.message : 'the refund reconcile failed', 500)
  }

  // A refund this run has just confirmed as gone through is money that moved
  // without anybody watching, so it has had no credit note and the books have
  // heard nothing. Raise it here, one at a time and never in parallel: each one
  // may print a PDF, and a batch of headless browsers is how an hourly cron job
  // starts falling over.
  for (const outcome of outcomes) {
    if (outcome.resolved === 'COMPLETED') await creditNoteForSettledRefund(outcome.refundId)
  }

  const unresolved = outcomes.filter((o) => o.resolved === 'STILL_UNKNOWN')
  const setAside = outcomes.filter((o) => o.setAside)

  // Kept in step with the table every run, and cleared once nothing is stuck.
  let listChanged = false
  try {
    if (unresolved.length > 0) {
      const title = staleRefundsTitle(unresolved.map((o) => o.orderNumber))
      const standing = await prisma.notification.findFirst({ where: { dedupeKey: STALE_REFUNDS_ALERT }, select: { title: true } })
      listChanged = standing?.title !== title
      await upsertAlert({ type: 'alert', dedupeKey: STALE_REFUNDS_ALERT, title, link: '/m/shop/orders', actionLabel: 'View orders' })
    } else {
      await clearAlert(STALE_REFUNDS_ALERT)
    }
  } catch (err) {
    // The bell is a convenience; if it cannot be written, email as the job always did.
    console.error('[shop] could not update the stale-refunds alert', err)
    listChanged = unresolved.length > 0
  }

  // A refund nobody can resolve automatically is exactly the thing that must not
  // sit silently in a table - it means a customer may or may not have their money.
  if (unresolved.length > 0 && listChanged) {
    try {
      const config = await getShopConfigCached()
      const to = config.storeEmail
      if (to) {
        const plural = unresolved.length === 1 ? 'refund needs' : 'refunds need'
        // Sent through the core sender rather than sendShopEmail: this is an
        // operational notice to the owner, not one of the shop's editable
        // customer templates, so it should not need a template row to exist.
        await sendEmail({
          moduleName: 'shop',
          to,
          subject: `${unresolved.length} ${plural} checking by hand`,
          html:
            `<p>These refunds were started but their outcome was never confirmed, and they could not be resolved automatically.</p>` +
            `<p>Please check them against your payment provider before refunding again, so nobody is refunded twice.</p><p>` +
            unresolved.map((o) => `Order ${escapeHtml(o.orderNumber)} - ${escapeHtml(o.reason ?? 'reason unknown')}`).join('<br>') +
            `</p>`,
          text:
            `These refunds were started but their outcome was never confirmed, and they could not be resolved automatically.\n\n` +
            `Please check them against your payment provider before refunding again, so nobody is refunded twice.\n\n` +
            unresolved.map((o) => `Order ${o.orderNumber} - ${o.reason ?? 'reason unknown'}`).join('\n'),
        })
      }
    } catch (err) {
      console.error('[shop] could not send the stranded-refund notice', err)
    }
  }

  // A refund recorded by hand that never finished saving has been taken off the
  // order's books. Nothing was refunded through the shop - but the owner may
  // well have sent the money themselves, and only they know.
  if (setAside.length > 0) {
    try {
      const config = await getShopConfigCached()
      const to = config.storeEmail
      if (to) {
        const lines = setAside.map((o) => `Order ${o.orderNumber}`)
        await sendEmail({
          moduleName: 'shop',
          to,
          subject: setAside.length === 1 ? 'A refund was not saved' : `${setAside.length} refunds were not saved`,
          html:
            `<p>A refund was being recorded on these orders when the request stopped, before anything was saved, so the shop has not counted it.</p>` +
            `<p>If you sent the customer the money, record the refund again on the order so its paperwork and stock match.</p><p>` +
            lines.map(escapeHtml).join('<br>') +
            `</p>`,
          text:
            `A refund was being recorded on these orders when the request stopped, before anything was saved, so the shop has not counted it.\n\n` +
            `If you sent the customer the money, record the refund again on the order so its paperwork and stock match.\n\n` +
            lines.join('\n'),
        })
      }
    } catch (err) {
      console.error('[shop] could not send the set-aside refund notice', err)
    }
  }

  return NextResponse.json({
    checked: outcomes.length,
    completed: outcomes.filter((o) => o.resolved === 'COMPLETED').length,
    failed: outcomes.filter((o) => o.resolved === 'FAILED').length,
    setAside: setAside.length,
    unresolved: unresolved.length,
  })
}

export const GET = handle
export const POST = handle
