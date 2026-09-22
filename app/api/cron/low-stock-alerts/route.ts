import { NextRequest, NextResponse } from 'next/server'
import { errorResponse } from '@/lib/utils'
import { getUnalertedLowStockProducts, claimLowStockAlert, releaseLowStockAlert } from '@/modules/shop/lib/db/products'
import { pruneAbandonedPendingOrders } from '@/modules/shop/lib/db/orders'
import { pruneOldImportJobs } from '@/modules/shop/lib/db/import-jobs'
import { getShopConfigCached } from '@/modules/shop/lib/config'
import { sendShopEmail } from '@/modules/shop/lib/email'
import { recomputePopularity } from '@/modules/shop/lib/popularity'

const ABANDONED_ORDER_HOURS = 24
const IMPORT_JOB_RETENTION_DAYS = 30

// Daily at 07:00 (manifest cronJobs). Also covers the Q11 import-job
// retention scope and the Q8 abandoned-PENDING-order pruning - one email per
// product that has run low, deduped via low_stock_alerted_at so a product isn't
// re-alerted every single day it stays low.
async function handle(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) return errorResponse('CRON_SECRET is not configured', 503)
  const auth = request.headers.get('authorization')
  if (auth !== `Bearer ${secret}`) return errorResponse('Unauthorized', 401)

  const config = await getShopConfigCached()
  let alerted = 0
  // What went wrong, in words, for the Schedules page. Core records a job as
  // failed only when it answers with an error status, and shows `error` beside
  // it - so a part that failed quietly here used to read as a clean run.
  const problems: string[] = []

  if (config.lowStockAlertEnabled) {
    const products = await getUnalertedLowStockProducts()
    const alertEmail = config.lowStockAlertEmail || config.storeEmail
    if (products.length > 0 && alertEmail) {
      let unsent = 0
      let lastError = ''
      for (const product of products) {
        // Claimed before sending, one product at a time: a second run
        // overlapping this one skips what this one has taken, and a failure
        // part-way no longer leaves the ones already sent unmarked (and so
        // re-sent tomorrow).
        if (!(await claimLowStockAlert(product.id))) continue
        try {
          await sendShopEmail('LOW_STOCK', alertEmail, {
            productName: product.name,
            stockCount: String(product.stockCount ?? 0),
          })
          alerted++
        } catch (err) {
          // Handed back, so tomorrow's run tries it again.
          await releaseLowStockAlert(product.id).catch(() => {})
          unsent++
          lastError = err instanceof Error ? err.message : String(err)
        }
      }
      if (unsent > 0) problems.push(`${unsent} low-stock email${unsent === 1 ? '' : 's'} did not send (${lastError}); ${unsent === 1 ? 'it' : 'they'} will be tried again tomorrow.`)
    }
  }

  const prunedOrders = await pruneAbandonedPendingOrders(ABANDONED_ORDER_HOURS)
  const prunedImportJobs = await pruneOldImportJobs(IMPORT_JOB_RETENTION_DAYS)

  // Best-seller ordering, refreshed once a day rather than on every sale: the
  // money path stays exactly as it was, and a best-seller list is not a thing
  // that needs to be right to the second. Daily also ages sales out of the
  // window, which nothing else would ever trigger.
  let popularity: { ranked: number; sold: number } | null = null
  try {
    popularity = await recomputePopularity()
  } catch (err) {
    // A ranking that failed to refresh is yesterday's ranking, which is fine.
    // It must not cost the owner their low-stock email or the pruning above -
    // both have already happened by now - but it is still said, rather than
    // leaving the best-seller order quietly stuck for days.
    console.error('[shop] best-seller ranking did not refresh', err)
    problems.push(`The best-seller order did not refresh (${err instanceof Error ? err.message : String(err)}); yesterday's order stays until the next run.`)
  }

  // Everything above has run either way; the status only says whether all of
  // it went through.
  return NextResponse.json({
    ok: problems.length === 0,
    ...(problems.length > 0 ? { error: problems.join(' ') } : {}),
    lowStockAlerted: alerted,
    prunedAbandonedOrders: prunedOrders,
    prunedImportJobs,
    rankedProducts: popularity?.ranked ?? null,
    productsWithSales: popularity?.sold ?? null,
  }, { status: problems.length === 0 ? 200 : 500 })
}

export async function GET(request: NextRequest) {
  return handle(request)
}

export async function POST(request: NextRequest) {
  return handle(request)
}
