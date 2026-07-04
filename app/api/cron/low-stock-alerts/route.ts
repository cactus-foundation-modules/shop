import { NextRequest, NextResponse } from 'next/server'
import { errorResponse } from '@/lib/utils'
import { getUnalertedLowStockProducts, markLowStockAlerted } from '@/modules/shop/lib/db/products'
import { pruneAbandonedPendingOrders } from '@/modules/shop/lib/db/orders'
import { pruneOldImportJobs } from '@/modules/shop/lib/db/import-jobs'
import { getShopConfigCached } from '@/modules/shop/lib/config'
import { sendShopEmail } from '@/modules/shop/lib/email'

const ABANDONED_ORDER_HOURS = 24
const IMPORT_JOB_RETENTION_DAYS = 30

// Daily at 07:00 (manifest cronJobs). Also covers the Q11 import-job
// retention scope and the Q8 abandoned-PENDING-order pruning - one daily
// digest email per run, deduped via low_stock_alerted_at so a product isn't
// re-alerted every single day it stays low.
async function handle(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) return errorResponse('CRON_SECRET is not configured', 503)
  const auth = request.headers.get('authorization')
  if (auth !== `Bearer ${secret}`) return errorResponse('Unauthorized', 401)

  const config = await getShopConfigCached()
  let alerted = 0

  if (config.lowStockAlertEnabled) {
    const products = await getUnalertedLowStockProducts()
    const alertEmail = config.lowStockAlertEmail || config.storeEmail
    if (products.length > 0 && alertEmail) {
      for (const product of products) {
        await sendShopEmail('LOW_STOCK', alertEmail, {
          productName: product.name,
          stockCount: String(product.stockCount ?? 0),
        })
      }
      await markLowStockAlerted(products.map((p) => p.id))
      alerted = products.length
    }
  }

  const prunedOrders = await pruneAbandonedPendingOrders(ABANDONED_ORDER_HOURS)
  const prunedImportJobs = await pruneOldImportJobs(IMPORT_JOB_RETENTION_DAYS)

  return NextResponse.json({ ok: true, lowStockAlerted: alerted, prunedAbandonedOrders: prunedOrders, prunedImportJobs })
}

export async function GET(request: NextRequest) {
  return handle(request)
}

export async function POST(request: NextRequest) {
  return handle(request)
}
