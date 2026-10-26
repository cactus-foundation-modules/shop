import { after, NextRequest, NextResponse } from 'next/server'
import { errorResponse } from '@/lib/utils'
import { runRetryLink } from '@/modules/shop/lib/order-email-retry'

// One link of the failed-email retry (lib/order-email-retry.ts). A failed send
// calls the first link, and each link calls the next, for as long as some
// email is still trying.
//
// Also on the site's schedule, every half hour, as the sweep for a chain that
// never started - the request that failed died before it could call the
// first link. A link with nothing to do is three indexed statements that find
// nothing; one that finds an expired retry rewords its note to say it stopped.
//
// Answers at once and does the work afterwards, so the link that called it is
// not held for the length of a send - that wait is the whole reason the tries
// are spread across requests at all.
//
// The same bearer token as every scheduled job, because it is one in all but
// timing: nobody else has any business making the site send mail.
async function handle(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) return errorResponse('CRON_SECRET is not configured', 503)
  if (request.headers.get('authorization') !== `Bearer ${secret}`) return errorResponse('Unauthorized', 401)

  after(() => runRetryLink().catch((error) => {
    console.error('[shop] email retry link failed', error)
  }))
  return NextResponse.json({ ok: true }, { status: 202 })
}

export async function POST(request: NextRequest) {
  return handle(request)
}

// The schedule calls with GET, as it does every job.
export async function GET(request: NextRequest) {
  return handle(request)
}
