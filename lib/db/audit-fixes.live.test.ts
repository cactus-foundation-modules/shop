import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { Client } from 'pg'
import {
  connectionUri,
  createTestDatabase,
  createTestRole,
  dropStaleTestObjects,
  dropTestDatabase,
  dropTestRole,
  testServerFromEnv,
  type TestRole,
  type TestServer,
} from '@/lib/backup/test-database'

// The bug-audit fixes of September 2026, against a real Postgres.
//
// Nearly every one of them is raw SQL, and raw SQL is the one thing tsc, eslint
// and the module build gate have nothing whatever to say about - a query
// Postgres will not parse passes all three. So each changed statement is run
// here through the function that owns it: the stock ledger at payment and on
// refund, payment_status following refunds, the guards that stop a replayed or
// re-paid order being fulfilled twice, the refund reconciler and its alert, the
// download slot, the import job, the claim-then-send alerts, the sitemap, the
// reports, and a replacement part's stock.
//
// Gated exactly as the suites next door are, and the database it makes is a
// cactus_rt_* one, dropped afterwards. Nothing else on that server is ever
// named, opened or altered.

vi.mock('next/headers', () => ({ headers: async () => new Headers(), cookies: async () => ({ get: () => undefined }) }))
vi.mock('@/modules/shop/lib/access', async (orig) => ({
  ...(await orig<typeof import('@/modules/shop/lib/access')>()),
  requireShopUser: async () => ({ user: { id: 'u1' }, error: null }),
}))

const ENABLED = process.env.RUN_LEDGER_GUARDS === '1' || process.env.RUN_BACKUP_ROUNDTRIP === '1'
if (ENABLED) {
  try {
    ;(process as unknown as { loadEnvFile: (path: string) => void }).loadEnvFile('.env')
  } catch {
    // No .env - testServerFromEnv below fails the suite loudly rather than here.
  }
}
const suite = ENABLED ? describe : describe.skip

suite('audit fixes, against a real database', () => {
  let server: TestServer
  let role: TestRole
  let client: Client
  const databaseName = `cactus_rt_shopaudit_${process.pid}`
  const roleName = `cactus_rt_role_shopaudit_${process.pid}`

  type Orders = typeof import('@/modules/shop/lib/db/orders')
  let orders: Orders
  let q: (sql: string, params?: unknown[]) => Promise<Record<string, unknown>[]>

  const addr = { firstName: 'A', lastName: 'Buyer', line1: '1 Street', city: 'Town', postcode: 'E1 1AA', country: 'GB' }
  const item = (over: Record<string, unknown>) => ({
    productId: null, productName: 'Thing', productSku: null, productType: 'PHYSICAL',
    quantity: 1, unitPrice: 100, taxRate: 0.2, taxAmount: 20, total: 100,
    isPreOrder: false, preOrderDispatchDate: null, ...over,
  })

  beforeAll(async () => {
    server = testServerFromEnv()
    await dropStaleTestObjects(server)
    role = await createTestRole(server, roleName)
    await createTestDatabase(server, databaseName, role)
    const uri = connectionUri(server, databaseName, role)
    client = new Client({ connectionString: `${uri}&uselibpqcompat=true` })
    await client.connect()
    await client.query('CREATE EXTENSION IF NOT EXISTS pgcrypto')
    await client.query(readFileSync(join(process.cwd(), 'prisma', 'migrations', '20260626000000_init', 'migration.sql'), 'utf8'))
    const dir = join(__dirname, '..', '..', 'migrations')
    for (const file of readdirSync(dir).filter((n) => n.endsWith('.sql')).sort()) {
      await client.query(readFileSync(join(dir, file), 'utf8'))
    }
    q = async (sql, params = []) => (await client.query(sql, params)).rows
    process.env.DATABASE_URL = uri
    orders = await import('@/modules/shop/lib/db/orders')

    await q(`INSERT INTO "shp_settings" ("id","config") VALUES ('singleton','{"invoicesEnabled":true,"invoiceIssueOn":"PAID","taxMode":"EXCLUSIVE"}'::jsonb)
             ON CONFLICT ("id") DO UPDATE SET "config" = EXCLUDED."config"`)
    await q(`INSERT INTO "shp_products" ("id","name","slug","type","price","status","track_inventory","stock_count","out_of_stock_behaviour")
             VALUES ('p-stock','Stock chair','stock-chair','PHYSICAL','100.00','ACTIVE',true,5,'BLOCK')`)
    await q(`INSERT INTO "shp_products" ("id","name","slug","type","price","status","track_inventory","stock_count","is_pre_order","pre_order_max_quantity","pre_order_count")
             VALUES ('p-pre','Pre chair','pre-chair','PHYSICAL','50.00','ACTIVE',true,0,true,10,0)`)
    await q(`INSERT INTO "shp_products" ("id","name","slug","type","price","status","parts_only") VALUES ('p-part','Gas lift','gas-lift','PHYSICAL','10.00','ACTIVE',true)`)
    await q(`INSERT INTO "shp_categories" ("id","name","slug") VALUES ('cat-1','Chairs','chairs'), ('cat-2','Parts','parts')`)
    await q(`INSERT INTO "shp_product_categories" ("product_id","category_id") VALUES ('p-stock','cat-1'), ('p-part','cat-2')`)
    await q(`INSERT INTO "shp_collections" ("id","name","slug") VALUES ('col-1','Best','best'), ('col-2','Spares','spares')`)
    await q(`INSERT INTO "shp_product_collections" ("product_id","collection_id") VALUES ('p-stock','col-1'), ('p-part','col-2')`)
    await q(`INSERT INTO "shp_coupons" ("id","code","type","value","per_customer_limit") VALUES ('cp-1','SAVE','FIXED_AMOUNT','5.00',1)`)
  }, 300_000)

  afterAll(async () => {
    await import('@/lib/db/prisma').then((m) => m.prisma.$disconnect()).catch(() => undefined)
    await client?.end().catch(() => undefined)
    if (server) {
      await dropTestDatabase(server, databaseName).catch(() => undefined)
      await dropTestRole(server, roleName).catch(() => undefined)
    }
  }, 120_000)

  let orderA = ''
  let itemA = ''

  it('takes stock at payment and records it in the ledger', async () => {
    const created = await orders.createPendingOrder({
      orderNumber: 'DW000001', customerEmail: 'a@example.com', customerName: 'A Buyer', shippingAddress: addr,
      subtotal: 200, discountAmount: 0, shippingAmount: 0, taxAmount: 40, total: 240, taxMode: 'EXCLUSIVE', currency: 'GBP',
      paymentMethod: 'BANK_TRANSFER', couponId: 'cp-1', couponCode: 'SAVE',
      items: [item({ productId: 'p-stock', productName: 'Stock chair', quantity: 2, total: 200, taxAmount: 40 })],
    } as Parameters<Orders['createPendingOrder']>[0])
    orderA = created.id
    itemA = (await orders.getOrderItems(orderA))[0]!.id
    expect(await orders.markOrderPaid(orderA, 'ref-a')).toBe(true)
    const { takeStockForPaidOrder } = await import('@/modules/shop/lib/db/order-stock')
    expect(await takeStockForPaidOrder('DW000001', [itemA])).toEqual([])
    expect((await q(`SELECT stock_count FROM shp_products WHERE id='p-stock'`))[0]!.stock_count).toBe(3)
    expect((await q(`SELECT COUNT(*)::int AS n FROM shp_stock_movements`))[0]!.n).toBeGreaterThan(0)
  })

  it('reports a shortfall instead of clamping silently', async () => {
    const created = await orders.createPendingOrder({
      orderNumber: 'DW000002', customerEmail: 'b@example.com', customerName: 'B', shippingAddress: addr,
      subtotal: 1000, discountAmount: 0, shippingAmount: 0, taxAmount: 0, total: 1000, taxMode: 'EXCLUSIVE', currency: 'GBP',
      paymentMethod: 'STRIPE', items: [item({ productId: 'p-stock', quantity: 10, total: 1000, taxAmount: 0 })],
    } as Parameters<Orders['createPendingOrder']>[0])
    const items = await orders.getOrderItems(created.id)
    const { takeStockForPaidOrder } = await import('@/modules/shop/lib/db/order-stock')
    const shortfalls = await takeStockForPaidOrder('DW000002', items.map((i) => i.id))
    expect(shortfalls.length).toBe(1)
    await orders.flagOrderForAttention(created.id, 'Stock ran out', { hold: true })
    const order = await orders.getOrderById(created.id)
    expect(order?.status).toBe('ON_HOLD')
  })

  it('counts coupons and pre-orders with the new queries', async () => {
    const { getCouponById } = await import('@/modules/shop/lib/db/discounts')
    expect((await getCouponById('cp-1'))?.code).toBe('SAVE')
    expect(await orders.countPriorCouponOrdersByEmail('a@example.com', 'cp-1')).toBe(1)
    expect(await orders.countPriorOrdersByEmail('a@example.com')).toBeGreaterThanOrEqual(1)
    const { incrementPreOrderCount } = await import('@/modules/shop/lib/db/products')
    const counted = await incrementPreOrderCount('p-pre', 12)
    expect(counted?.count).toBe(12)
    expect(counted?.limit).toBe(10)
    expect((await q(`SELECT is_pre_order FROM shp_products WHERE id='p-pre'`))[0]!.is_pre_order).toBe(false)
  })

  it('refunds: settles payment_status, restocks undispatched units, guards replays', async () => {
    const { processRefund } = await import('@/modules/shop/lib/db/refunds')
    const outcome = await processRefund({
      orderId: orderA, reason: 'test', createdBy: 'u1',
      items: [{ orderItemId: itemA, quantity: 1, amount: 120 }],
      performRefund: async () => ({ success: true, providerRefundId: null }),
    })
    expect(outcome.ok).toBe(true)
    const order = await orders.getOrderById(orderA)
    expect(order?.paymentStatus).toBe('PARTIALLY_REFUNDED')
    expect(order?.status).toBe('PARTIALLY_REFUNDED')
    // The shortfall order above took the last 3, so one unit back makes 1.
    expect((await q(`SELECT stock_count FROM shp_products WHERE id='p-stock'`))[0]!.stock_count).toBe(1)
    // And the ledger never puts back more than this order took.
    await (await import('@/modules/shop/lib/db/order-stock')).restockRefundedUnits(orderA, [{ orderItemId: itemA, quantity: 5 }])
    expect((await q(`SELECT stock_count FROM shp_products WHERE id='p-stock'`))[0]!.stock_count).toBeLessThanOrEqual(2)
    expect(await orders.markOrderPaid(orderA, 'again')).toBe(false)
    expect(await orders.confirmManualPayment(orderA)).toBe(false)
    await orders.markOrderAwaitingConfirmation(orderA)
    await orders.restoreOriginalPaymentMethod(orderA)
    expect((await orders.getOrderById(orderA))?.paymentStatus).toBe('PARTIALLY_REFUNDED')
    await orders.recordProviderRefund(orderA, 'REFUNDED')
    expect((await orders.getOrderById(orderA))?.paymentStatus).toBe('REFUNDED')
    await orders.markOrderPaymentFailed(orderA, 'CHARGEBACK')
  })

  it('lists and summarises with the widened paid states', async () => {
    for (const paymentStatus of ['PAID', 'PARTIALLY_REFUNDED', 'REFUNDED', 'UNPAID', 'PENDING', 'FAILED'] as const) {
      const { orders: rows } = await orders.listOrders({ paymentStatus })
      expect(Array.isArray(rows)).toBe(true)
    }
    await orders.listOrders({ openOnly: true, fulfilment: 'UNDISPATCHED' } as Parameters<Orders['listOrders']>[0])
    const overview = await orders.getOrdersOverview()
    expect(typeof overview.toDispatch).toBe('number')
    const summary = await orders.getCustomerSummary('a@example.com')
    expect(summary.orderCount).toBeGreaterThanOrEqual(1)
    const ids = (await q(`SELECT id FROM shp_orders`)).map((r) => r.id as string)
    const metrics = await orders.getOrderRowMetrics(ids)
    expect(Object.keys(metrics).length).toBeGreaterThan(0)
    await orders.getOrderRowMetrics(ids, { dueDates: false })
    const items = await orders.getOrderItemsForOrders(ids)
    expect(items.size).toBeGreaterThan(0)
    const { listOrdersAwaitingCompletion } = await import('@/modules/shop/lib/db/shipments')
    await listOrdersAwaitingCompletion(10)
    await orders.outstandingPreOrderItems(await orders.getOrderItems(orderA))
  })

  it('reconciles stale refunds, treating replacements as recorded', async () => {
    const rep = await orders.createPendingOrder({
      orderNumber: 'DW000001-R1', kind: 'REPLACEMENT', parentOrderId: orderA, status: 'PROCESSING', paymentStatus: 'PAID', paidAt: new Date(),
      customerEmail: 'a@example.com', customerName: 'A', shippingAddress: addr,
      subtotal: 10, discountAmount: 0, shippingAmount: 0, taxAmount: 2, total: 12, taxMode: 'EXCLUSIVE', currency: 'GBP',
      paymentMethod: 'STRIPE', items: [item({ productName: 'Castor', total: 10, taxAmount: 2, unitPrice: 10 })],
    } as Parameters<Orders['createPendingOrder']>[0])
    await q(`INSERT INTO shp_refunds (id, order_id, amount, status, created_by, created_at, intended_items)
             VALUES ('rf-stale', $1, '12.00', 'PENDING', 'u1', NOW() - INTERVAL '1 hour', '[]'::jsonb)`, [rep.id])
    const { reconcileStaleRefunds } = await import('@/modules/shop/lib/db/refunds')
    const outcomes = await reconcileStaleRefunds(() => ({ refundMode: 'provider' }), 1)
    const mine = outcomes.find((o) => o.refundId === 'rf-stale')
    expect(mine?.resolved).toBe('FAILED')
    expect(mine?.setAside).toBe(true)
  })

  it('import jobs, back-in-stock and low-stock claims', async () => {
    const jobs = await import('@/modules/shop/lib/db/import-jobs')
    const { id } = await jobs.createImportJob({ filename: 'x.csv', totalRows: 1, createdBy: 'u1', columnMap: null })
    await jobs.updateImportJobProgress(id, { processedRows: 1, createdCount: 0, updatedCount: 0, skippedCount: 500, errors: Array.from({ length: 500 }, (_, i) => ({ row: i, reason: 'bad' })) } as Parameters<typeof jobs.updateImportJobProgress>[1])
    await jobs.failImportJobIfUnfinished(id)
    expect((await jobs.getImportJobById(id))?.status).toBe('FAILED')
    expect((await jobs.getImportJobById(id))?.errors?.length).toBe(200)

    await q(`INSERT INTO shp_back_in_stock_subscriptions (id, product_id, email) VALUES ('bis-1','p-stock','x@example.com')`)
    const bis = await import('@/modules/shop/lib/db/back-in-stock')
    expect(await bis.claimSubscriberForNotification('bis-1')).toBe(true)
    expect(await bis.claimSubscriberForNotification('bis-1')).toBe(false)
    await bis.releaseSubscriberNotification('bis-1')
    expect(await bis.claimSubscriberForNotification('bis-1')).toBe(true)

    const products = await import('@/modules/shop/lib/db/products')
    expect(await products.claimLowStockAlert('p-stock')).toBe(true)
    expect(await products.claimLowStockAlert('p-stock')).toBe(false)
    await products.releaseLowStockAlert('p-stock')
  })

  it('reserves and releases download slots atomically', async () => {
    await q(`INSERT INTO shp_digital_files (id, filename, url, size, mime_type) VALUES ('f-1','a.pdf','https://x/a.pdf',10,'application/pdf')`)
    await q(`INSERT INTO shp_digital_downloads (id, order_id, order_item_id, file_id, token) VALUES ('dl-1',$1,$2,'f-1','tok-1')`, [orderA, itemA])
    const digital = await import('@/modules/shop/lib/db/digital')
    expect(await digital.reserveDownloadSlot('dl-1', 1)).toBe(true)
    expect(await digital.reserveDownloadSlot('dl-1', 1)).toBe(false)
    await digital.releaseDownloadSlot('dl-1')
    expect(await digital.reserveDownloadSlot('dl-1', null)).toBe(true)
  })

  it('requests queue, sitemap and recommendations', async () => {
    const { listRequestsForAdmin } = await import('@/modules/shop/lib/db/order-requests')
    await listRequestsForAdmin({ limit: Number.NaN, offset: Number.NaN } as Parameters<typeof listRequestsForAdmin>[0])
    await listRequestsForAdmin({ limit: 2.5, offset: 1 } as Parameters<typeof listRequestsForAdmin>[0])
    const { getPublicSitemapEntries } = await import('@/modules/shop/lib/sitemap')
    const entries = await getPublicSitemapEntries('https://shop.test')
    const urls = entries.map((e) => e.url)
    expect(urls.some((u) => u.includes('chairs'))).toBe(true)
    expect(urls.some((u) => u.includes('/parts'))).toBe(false)
    expect(urls.some((u) => u.includes('spares'))).toBe(false)
    const { resolveAutomaticRecommendations } = await import('@/modules/shop/lib/db/recommendations')
    await resolveAutomaticRecommendations('p-stock', 5)
  })

  it('invoice netting and voiding in one transaction', async () => {
    const { prisma } = await import('@/lib/db/prisma')
    const refunds = await import('@/modules/shop/lib/db/refunds')
    const invoices = await import('@/modules/shop/lib/db/invoices')
    await q(`INSERT INTO shp_invoices (id, order_id, invoice_number, tax_point_date, currency, tax_mode, subtotal, total, status)
             VALUES ('inv-1',$1,'INV-1',CURRENT_DATE,'GBP','EXCLUSIVE','200.00','240.00','ISSUED')`, [orderA])
    const refundIds = (await q(`SELECT id FROM shp_refunds WHERE order_id=$1`, [orderA])).map((r) => r.id as string)
    await prisma.$transaction(async (tx) => {
      await refunds.markRefundsNettedOff(refundIds, 'inv-1', tx)
    })
    expect((await q(`SELECT COUNT(*)::int AS n FROM shp_refunds WHERE netted_off_invoice_id='inv-1'`))[0]!.n).toBe(refundIds.length)
    await prisma.$transaction(async (tx) => {
      expect(await invoices.voidInvoice('inv-1', 'test', tx)).toBe(true)
      await refunds.clearRefundsNettedOff('inv-1', tx)
    })
    expect((await q(`SELECT COUNT(*)::int AS n FROM shp_refunds WHERE netted_off_invoice_id='inv-1'`))[0]!.n).toBe(0)
  })

  it('records an orphaned payment and dismisses it', async () => {
    const stranded = await import('@/modules/shop/lib/stranded-payments')
    await stranded.recordOrphanedPayment({ orderId: 'gone-1', orderNumber: 'DW000099', paymentMethod: 'STRIPE', amountMinorUnits: 12345, currency: 'gbp' })
    await stranded.recordOrphanedPayment({ orderId: 'gone-1', orderNumber: 'DW000099', paymentMethod: 'STRIPE', amountMinorUnits: 12345, currency: 'gbp' })
    const rows = await stranded.listStrandedPayments()
    const row = rows.find((r) => r.draftId === 'gone-1')
    expect(row?.total).toBe('123.45')
    expect(row?.currency).toBe('GBP')
    expect(row?.attempts).toBe(2)
    await stranded.clearStrandedPayment('gone-1')
    expect((await stranded.listStrandedPayments()).find((r) => r.draftId === 'gone-1')).toBeUndefined()
  })

  it('admin report routes run', async () => {
    const { NextRequest } = await import('next/server')
    const tax = await import('@/modules/shop/app/api/admin/reports/tax/route')
    const taxRes = await tax.GET(new NextRequest('https://shop.test/api/m/shop/admin/reports/tax?from=2026-01-01&to=2026-12-31'))
    expect(taxRes.status).toBe(200)
    const taxAll = await tax.GET(new NextRequest('https://shop.test/api/m/shop/admin/reports/tax'))
    expect(taxAll.status).toBe(200)
    const revenue = await import('@/modules/shop/app/api/admin/reports/revenue/route')
    expect((await (revenue.GET as () => Promise<Response>)()).status).toBe(200)
    const widget = await import('@/modules/shop/app/api/admin/dashboard-widget/route')
    expect((await (widget.GET as () => Promise<Response>)()).status).toBe(200)
    const customers = await import('@/modules/shop/app/api/admin/customers/route')
    expect((await customers.GET(new NextRequest('https://shop.test/x?search=a'))).status).toBe(200)
    const rsc = await import('@/modules/shop/components/admin/ShopDashboardWidget')
    const fn = Object.values(rsc).find((v) => typeof v === 'function') as (() => Promise<unknown>) | undefined
    if (fn) await fn()
  })

  it('re-payment after a chargeback does not re-fulfil', async () => {
    const created = await orders.createPendingOrder({
      orderNumber: 'DW000010', customerEmail: 'c@example.com', customerName: 'C', shippingAddress: addr,
      subtotal: 10, discountAmount: 0, shippingAmount: 0, taxAmount: 2, total: 12, taxMode: 'EXCLUSIVE', currency: 'GBP',
      paymentMethod: 'STRIPE', items: [item({ total: 10, taxAmount: 2, unitPrice: 10 })],
    } as Parameters<Orders['createPendingOrder']>[0])
    expect(await orders.markOrderPaid(created.id, 'pi_1')).toBe(true)
    await orders.markOrderPaymentFailed(created.id, 'CHARGEBACK')
    expect((await orders.getOrderById(created.id))?.status).toBe('ON_HOLD')
    expect(await orders.markOrderPaid(created.id, 'pi_1')).toBe(false)
    const after = await orders.getOrderById(created.id)
    expect(after?.paymentStatus).toBe('PAID')
    expect(after?.status).toBe('ON_HOLD')
    const notes = await q(`SELECT content FROM shp_order_notes WHERE order_id=$1`, [created.id])
    expect(notes.some((n) => String(n.content).includes('arrived again'))).toBe(true)
    // A first manual confirmation still reports a first payment.
    const bank = await orders.createPendingOrder({
      orderNumber: 'DW000011', customerEmail: 'c@example.com', customerName: 'C', shippingAddress: addr,
      subtotal: 10, discountAmount: 0, shippingAmount: 0, taxAmount: 2, total: 12, taxMode: 'EXCLUSIVE', currency: 'GBP',
      paymentMethod: 'BANK_TRANSFER', items: [item({ total: 10, taxAmount: 2, unitPrice: 10 })],
    } as Parameters<Orders['createPendingOrder']>[0])
    expect(await orders.confirmManualPayment(bank.id)).toBe(true)
    expect(await orders.confirmManualPayment(bank.id)).toBe(false)
  })

  it('a part refund leaves a completed order completed', async () => {
    const created = await orders.createPendingOrder({
      orderNumber: 'DW000012', customerEmail: 'd@example.com', customerName: 'D', shippingAddress: addr,
      subtotal: 200, discountAmount: 0, shippingAmount: 0, taxAmount: 40, total: 240, taxMode: 'EXCLUSIVE', currency: 'GBP',
      paymentMethod: 'BANK_TRANSFER', items: [item({ quantity: 2, total: 200, taxAmount: 40 })],
    } as Parameters<Orders['createPendingOrder']>[0])
    expect(await orders.markOrderPaid(created.id, 'x')).toBe(true)
    await q(`UPDATE shp_orders SET status='COMPLETED' WHERE id=$1`, [created.id])
    const [line] = await orders.getOrderItems(created.id)
    const { processRefund } = await import('@/modules/shop/lib/db/refunds')
    const outcome = await processRefund({
      orderId: created.id, reason: 'broken', createdBy: 'u1',
      items: [{ orderItemId: line!.id, quantity: 1, amount: 120 }],
      performRefund: async () => ({ success: true, providerRefundId: null }),
    })
    expect(outcome.ok).toBe(true)
    const order = await orders.getOrderById(created.id)
    expect(order?.status).toBe('COMPLETED')
    expect(order?.paymentStatus).toBe('PARTIALLY_REFUNDED')
    await orders.recordProviderRefund(created.id, 'PARTIALLY_REFUNDED')
    expect((await orders.getOrderById(created.id))?.status).toBe('COMPLETED')
  })

  it('every order-list sort runs', async () => {
    for (const sort of ['newest', 'oldest', 'total-desc', 'total-asc', 'customer-asc', 'status'] as const) {
      await orders.listOrders({ sort, page: 1, perPage: 2 } as Parameters<Orders['listOrders']>[0])
    }
    await orders.listOrders({ preOrder: true, page: 1, perPage: 2 } as Parameters<Orders['listOrders']>[0])
  })

  it('the reconcile job keeps one rolling alert', async () => {
    process.env.CRON_SECRET = 'test-secret'
    const gone = await orders.createPendingOrder({
      orderNumber: 'DW000013', customerEmail: 'e@example.com', customerName: 'E', shippingAddress: addr,
      subtotal: 10, discountAmount: 0, shippingAmount: 0, taxAmount: 0, total: 10, taxMode: 'EXCLUSIVE', currency: 'GBP',
      paymentMethod: 'GONE', items: [item({ total: 10, taxAmount: 0, unitPrice: 10 })],
    } as Parameters<Orders['createPendingOrder']>[0])
    await q(`INSERT INTO shp_refunds (id, order_id, amount, status, created_by, created_at, intended_items)
             VALUES ('rf-unknown', $1, '1.00', 'PENDING', 'u1', NOW() - INTERVAL '1 hour', '[]'::jsonb)`, [gone.id])
    const { NextRequest } = await import('next/server')
    const cron = await import('@/modules/shop/app/api/cron/reconcile-refunds/route')
    const call = () => cron.GET(new NextRequest('https://shop.test/x', { headers: { authorization: 'Bearer test-secret' } }))
    const first = await call()
    expect(first.status).toBe(200)
    const alerts = await q(`SELECT title FROM "Notification" WHERE "dedupeKey"='shop:stale-refunds'`)
    expect(alerts.length).toBe(1)
    await call()
    expect((await q(`SELECT COUNT(*)::int AS n FROM "Notification" WHERE "dedupeKey"='shop:stale-refunds'`))[0]!.n).toBe(1)
  })

  it('a replacement takes its part through the stock ledger, and a refund puts it back', async () => {
    await q(`INSERT INTO shp_products ("id","name","slug","type","price","status","track_inventory","stock_count","parts_only")
             VALUES ('p-lift','Gas lift 2','gas-lift-2','PHYSICAL','20.00','ACTIVE',true,5,true)`)
    const { createReplacementOrder } = await import('@/modules/shop/lib/replacements')
    const made = await createReplacementOrder({ parentOrderId: orderA, lines: [{ productId: 'p-lift', quantity: 1, unitPrice: 20, replacesOrderItemId: itemA }] })
    expect(made.ok).toBe(true)
    if (!made.ok) return
    expect((await q(`SELECT stock_count FROM shp_products WHERE id='p-lift'`))[0]!.stock_count).toBe(4)
    const [line] = await orders.getOrderItems(made.order.id)
    const { processRefund } = await import('@/modules/shop/lib/db/refunds')
    const outcome = await processRefund({
      orderId: made.order.id, reason: 'not needed', createdBy: 'u1',
      items: [{ orderItemId: line!.id, quantity: 1, amount: Number(line!.total) + Number(line!.taxAmount) }],
      performRefund: async () => ({ success: true, providerRefundId: null }),
    })
    expect(outcome.ok).toBe(true)
    expect((await q(`SELECT stock_count FROM shp_products WHERE id='p-lift'`))[0]!.stock_count).toBe(5)
  })

  it('refunds the delivery charge, capped at what is left of it', async () => {
    const created = await orders.createPendingOrder({
      orderNumber: 'DW000020', customerEmail: 'f@example.com', customerName: 'F', shippingAddress: addr,
      subtotal: 100, discountAmount: 0, shippingAmount: 10, taxAmount: 22, total: 132, taxMode: 'EXCLUSIVE', currency: 'GBP',
      paymentMethod: 'BANK_TRANSFER', items: [item({ total: 100, taxAmount: 20, unitPrice: 100 })],
    } as Parameters<Orders['createPendingOrder']>[0])
    expect(await orders.markOrderPaid(created.id, 'x')).toBe(true)
    const { processRefund, listRefundsForOrder, listUncreditedRefundDelivery } = await import('@/modules/shop/lib/db/refunds')
    const ok = await processRefund({
      orderId: created.id, reason: 'delivery back', createdBy: 'u1', items: [], shippingAmount: 12,
      performRefund: async () => ({ success: true, providerRefundId: null }),
    })
    expect(ok.ok).toBe(true)
    const [refund] = await listRefundsForOrder(created.id)
    expect(refund?.shippingAmount).toBe('12')
    expect((await listUncreditedRefundDelivery(created.id)).map((r) => Number(r.shippingAmount))).toEqual([12])
    const again = await processRefund({
      orderId: created.id, reason: 'twice', createdBy: 'u1', items: [], shippingAmount: 1,
      performRefund: async () => ({ success: true, providerRefundId: null }),
    })
    expect(again.ok).toBe(false)
  })

  it('records a full refund made in the provider dashboard, delivery and stock included, and only once', async () => {
    await q(`UPDATE shp_products SET stock_count = 10 WHERE id = 'p-stock'`)
    const created = await orders.createPendingOrder({
      orderNumber: 'DW000021', customerEmail: 'g@example.com', customerName: 'G', shippingAddress: addr,
      subtotal: 200, discountAmount: 0, shippingAmount: 10, taxAmount: 42, total: 252, taxMode: 'EXCLUSIVE', currency: 'GBP',
      paymentMethod: 'STRIPE', items: [item({ productId: 'p-stock', quantity: 2, total: 200, taxAmount: 40 })],
    } as Parameters<Orders['createPendingOrder']>[0])
    expect(await orders.markOrderPaid(created.id, 'pi_x')).toBe(true)
    const { takeStockForPaidOrder } = await import('@/modules/shop/lib/db/order-stock')
    await takeStockForPaidOrder('DW000021', (await orders.getOrderItems(created.id)).map((i) => i.id))
    expect((await q(`SELECT stock_count FROM shp_products WHERE id='p-stock'`))[0]!.stock_count).toBe(8)

    const { recordRefundMadeAtProvider } = await import('@/modules/shop/lib/provider-refund-ingest')
    expect(await recordRefundMadeAtProvider(created.id, { refundedTotal: 252, full: true, providerLabel: 'Stripe' })).toBe('recorded')
    const rows = await q(`SELECT amount::text, shipping_amount::text, status FROM shp_refunds WHERE order_id=$1`, [created.id])
    expect(rows).toEqual([{ amount: '252.00', shipping_amount: '12.00', status: 'COMPLETED' }])
    expect((await q(`SELECT stock_count FROM shp_products WHERE id='p-stock'`))[0]!.stock_count).toBe(10)
    expect((await orders.getOrderById(created.id))?.paymentStatus).toBe('REFUNDED')
    // The same webhook again, and the shop's own refund echoing back, change nothing.
    expect(await recordRefundMadeAtProvider(created.id, { refundedTotal: 252, full: true, providerLabel: 'Stripe' })).toBe('nothing')
  })

  it('leaves a note for a part refund made in the provider dashboard, once', async () => {
    const created = await orders.createPendingOrder({
      orderNumber: 'DW000022', customerEmail: 'h@example.com', customerName: 'H', shippingAddress: addr,
      subtotal: 100, discountAmount: 0, shippingAmount: 0, taxAmount: 20, total: 120, taxMode: 'EXCLUSIVE', currency: 'GBP',
      paymentMethod: 'STRIPE', items: [item({ total: 100, taxAmount: 20, unitPrice: 100 })],
    } as Parameters<Orders['createPendingOrder']>[0])
    expect(await orders.markOrderPaid(created.id, 'pi_y')).toBe(true)
    const { recordRefundMadeAtProvider } = await import('@/modules/shop/lib/provider-refund-ingest')
    expect(await recordRefundMadeAtProvider(created.id, { refundedTotal: 20, full: false, providerLabel: 'Stripe' })).toBe('noted')
    expect(await recordRefundMadeAtProvider(created.id, { refundedTotal: 20, full: false, providerLabel: 'Stripe' })).toBe('noted')
    const notes = await q(`SELECT content FROM shp_order_notes WHERE order_id=$1 AND content LIKE '%own dashboard%'`, [created.id])
    expect(notes).toHaveLength(1)
    expect((await q(`SELECT COUNT(*)::int AS n FROM shp_refunds WHERE order_id=$1`, [created.id]))[0]!.n).toBe(0)
  })

  it('gives the delivery back when a whole order is cancelled before anything was sent', async () => {
    const created = await orders.createPendingOrder({
      orderNumber: 'DW000023', customerEmail: 'i@example.com', customerName: 'I', shippingAddress: addr,
      subtotal: 100, discountAmount: 0, shippingAmount: 10, taxAmount: 22, total: 132, taxMode: 'EXCLUSIVE', currency: 'GBP',
      paymentMethod: 'BANK_TRANSFER', items: [item({ total: 100, taxAmount: 20, unitPrice: 100 })],
    } as Parameters<Orders['createPendingOrder']>[0])
    expect(await orders.markOrderPaid(created.id, 'x')).toBe(true)
    const requests = await import('@/modules/shop/lib/db/order-requests')
    const asked = await requests.createOrderRequest({ orderId: created.id, memberId: null, type: 'CANCEL', reason: 'CHANGED_MIND', items: [] })
    expect(asked.ok).toBe(true)
    if (!asked.ok) return
    const { approveOrderRequest } = await import('@/modules/shop/lib/order-request-actions')
    const decided = await approveOrderRequest({ requestId: asked.request.id, userId: 'u1', refund: true })
    expect(decided.ok).toBe(true)
    expect(decided.ok && decided.refundedAmount).toBe(132)
    const rows = await q(`SELECT amount::text, shipping_amount::text FROM shp_refunds WHERE order_id=$1 AND status='COMPLETED'`, [created.id])
    expect(rows).toEqual([{ amount: '132.00', shipping_amount: '12.00' }])
  })

  it('counts delivery VAT in the tax report, collected and refunded', async () => {
    const { NextRequest } = await import('next/server')
    const tax = await import('@/modules/shop/app/api/admin/reports/tax/route')
    const res = await tax.GET(new NextRequest('https://shop.test/api/m/shop/admin/reports/tax'))
    const body = await res.json() as { report: Array<{ taxRate: string; taxCollected: string; taxRefunded: string }> }
    const twenty = body.report.find((r) => Number(r.taxRate) === 0.2)
    expect(twenty).toBeDefined()
    // The delivery-carrying orders above each charged £2 of delivery VAT, and
    // the refunds above handed some back - both must show up in the 20% row.
    const goodsOnly = await q(`SELECT SUM(oi.tax_amount)::text AS goods FROM shp_order_items oi JOIN shp_orders o ON o.id = oi.order_id WHERE o.payment_status IN ('PAID','PARTIALLY_REFUNDED','REFUNDED') AND oi.tax_rate = 0.2`)
    expect(Number(twenty!.taxCollected)).toBeGreaterThan(Number(goodsOnly[0]!.goods))
    expect(Number(twenty!.taxRefunded)).toBeGreaterThan(0)
  })
})

