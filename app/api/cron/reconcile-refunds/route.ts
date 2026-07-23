import { NextRequest, NextResponse } from 'next/server'
import { errorResponse } from '@/lib/utils'
import { reconcileStaleRefunds } from '@/modules/shop/lib/db/refunds'
import { getPaymentProvider } from '@/modules/shop/lib/payments/registry'
import { getShopConfigCached } from '@/modules/shop/lib/config'
import { sendEmail } from '@/lib/email'

// Hourly. Resolves refunds left PENDING by a request that died between issuing
// the provider call and recording its outcome - the price of not holding a
// database connection open across that call.
//
// It never decides what happened on its own: the provider is asked, and anything
// short of a definite answer is left alone and reported. Money is only ever
// recorded as moved on the provider's own word.
async function handle(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) return errorResponse('CRON_SECRET is not configured', 503)
  const auth = request.headers.get('authorization')
  if (auth !== `Bearer ${secret}`) return errorResponse('Unauthorized', 401)

  const outcomes = await reconcileStaleRefunds((providerId) => getPaymentProvider(providerId) ?? null)

  const unresolved = outcomes.filter((o) => o.resolved === 'STILL_UNKNOWN')

  // A refund nobody can resolve automatically is exactly the thing that must not
  // sit silently in a table - it means a customer may or may not have their money.
  if (unresolved.length > 0) {
    try {
      const config = await getShopConfigCached()
      const to = config.storeEmail
      if (to) {
        const plural = unresolved.length === 1 ? 'refund needs' : 'refunds need'
        // Sent through the core sender rather than sendShopEmail: this is an
        // operational notice to the owner, not one of the shop's editable
        // customer templates, so it should not need a template row to exist.
        await sendEmail({
          to,
          subject: `${unresolved.length} ${plural} checking by hand`,
          html:
            `<p>These refunds were started but their outcome was never confirmed, and they could not be resolved automatically.</p>` +
            `<p>Please check them against your payment provider before refunding again, so nobody is refunded twice.</p><p>` +
            unresolved.map((o) => `Order ${o.orderId} - ${o.reason ?? 'reason unknown'}`).join('<br>') +
            `</p>`,
          text:
            `These refunds were started but their outcome was never confirmed, and they could not be resolved automatically.\n\n` +
            `Please check them against your payment provider before refunding again, so nobody is refunded twice.\n\n` +
            unresolved.map((o) => `Order ${o.orderId} - ${o.reason ?? 'reason unknown'}`).join('\n'),
        })
      }
    } catch (err) {
      console.error('[shop] could not send the stranded-refund notice', err)
    }
  }

  return NextResponse.json({
    checked: outcomes.length,
    completed: outcomes.filter((o) => o.resolved === 'COMPLETED').length,
    failed: outcomes.filter((o) => o.resolved === 'FAILED').length,
    unresolved: unresolved.length,
  })
}

export const GET = handle
export const POST = handle
