import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
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

// A supplier's despatch put on the customer's order (lib/despatch-observer.ts),
// against a real Postgres.
//
// The two new statements in lib/db/shipments.ts are raw SQL that no typecheck,
// lint or build runs: the "this parcel is already on the order" check taken
// inside createShipment's lock, and the guarded fill of a parcel that went out
// with no tracking. Both are what makes two announcements of one parcel,
// arriving together, one parcel on the customer's order - so they are run here,
// through the observer itself, with only the shop's settings and the outgoing
// emails stood in for.
//
// Gated like the other live suites: it needs the OVH server, makes cactus_rt_*
// databases, and drops them afterwards.
const ENABLED = process.env.RUN_LEDGER_GUARDS === '1' || process.env.RUN_SHOP_SQL === '1'
if (ENABLED) {
  try {
    ;(process as unknown as { loadEnvFile: (path: string) => void }).loadEnvFile('.env')
  } catch {
    // No .env - testServerFromEnv below fails the suite loudly rather than here.
  }
}
const suite = ENABLED ? describe : describe.skip

const settings = vi.hoisted(() => ({ mode: 'record' as 'off' | 'record' | 'record-and-tell' }))
const dispatchEmail = vi.hoisted(() => vi.fn())
const trackingEmail = vi.hoisted(() => vi.fn())
const slotEmail = vi.hoisted(() => vi.fn())

vi.mock('@/modules/shop/lib/config', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/modules/shop/lib/config')>()
  return {
    ...real,
    getShopConfigCached: async () => real.parseShpConfig({
      despatchFromSupplierTracking: settings.mode,
      deliveryCouriers: [{ id: 'dpd', name: 'DPD', trackingSource: 'dpd' }],
    }),
  }
})
vi.mock('@/modules/shop/lib/shipment-email', () => ({ sendShipmentDispatchedEmail: dispatchEmail }))
vi.mock('@/modules/shop/lib/tracking-added-email', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/modules/shop/lib/tracking-added-email')>()),
  sendTrackingAddedEmail: trackingEmail,
}))
vi.mock('@/modules/shop/lib/delivery-slot-email', () => ({
  sendDeliverySlotEmail: slotEmail,
  sendDeliveryDayEmail: vi.fn(),
}))
vi.mock('@/lib/config/timezone.server', () => ({ getSiteTimezone: async () => 'Europe/London' }))
const notify = vi.hoisted(() => vi.fn())
vi.mock('@/modules/shop/lib/order-notify', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/modules/shop/lib/order-notify')>()),
  notifyOrderCustomer: notify,
}))

suite('despatch from supplier tracking, against a real database', () => {
  let server: TestServer
  let role: TestRole
  let client: Client
  const databaseName = `cactus_rt_shopdsp_${process.pid}`
  const roleName = `cactus_rt_role_shopdsp_${process.pid}`

  let observer: typeof import('./despatch-observer')
  let shipments: typeof import('./db/shipments')
  let autoComplete: typeof import('./order-auto-complete')

  async function parcels(orderId: string) {
    return (await client.query(
      `SELECT s.*, (SELECT COUNT(*) FROM "shp_shipment_items" i WHERE i."shipment_id" = s."id")::int AS "items"
         FROM "shp_shipments" s WHERE s."order_id" = $1 ORDER BY s."created_at"`,
      [orderId],
    )).rows
  }

  function event(orderId: string, overrides: Record<string, unknown> = {}) {
    return {
      despatchId: `d-${orderId}`,
      change: 'new' as const,
      purchaseOrderNumber: 'PO-00012',
      source: { module: 'shop', orderId },
      lines: [{ sourceOrderItemId: `item-${orderId}`, qty: 1 }],
      carrier: 'DPD',
      trackingNumber: '12345678901234',
      trackingUrl: 'https://www.dpd.co.uk/d/AbC123dEf456',
      trackingShortCode: 'AbC123dEf456',
      deliveryDate: null,
      deliverySlot: null,
      ...overrides,
    }
  }

  beforeAll(async () => {
    server = testServerFromEnv()
    await dropStaleTestObjects(server)
    role = await createTestRole(server, roleName)
    await createTestDatabase(server, databaseName, role)

    const uri = connectionUri(server, databaseName, role)
    client = new Client({ connectionString: `${uri}&uselibpqcompat=true` })
    await client.connect()
    await client.query('CREATE EXTENSION IF NOT EXISTS pgcrypto')

    const coreInit = join(process.cwd(), 'prisma', 'migrations', '20260626000000_init', 'migration.sql')
    await client.query(readFileSync(coreInit, 'utf8'))
    const directory = join(__dirname, '..', 'migrations')
    for (const file of readdirSync(directory).filter((name) => name.endsWith('.sql')).sort()) {
      await client.query(readFileSync(join(directory, file), 'utf8'))
    }

    process.env.DATABASE_URL = uri
    observer = await import('./despatch-observer')
    shipments = await import('./db/shipments')
    autoComplete = await import('./order-auto-complete')

    // 068 a second time, as an install that already has it would.
    await client.query(readFileSync(join(directory, '068_quiet_parcels.sql'), 'utf8'))

    // One paid order per case, one line of one desk each.
    for (const [id, status] of [
      ['ord-new', 'PROCESSING'], ['ord-blank', 'PROCESSING'], ['ord-race', 'PROCESSING'],
      ['ord-other', 'SHIPPED'], ['ord-cancelled', 'CANCELLED'], ['ord-off', 'PROCESSING'],
      ['ord-two', 'PROCESSING'],
    ] as const) {
      await client.query(
        `INSERT INTO "shp_orders" (
          "id","order_number","customer_email","customer_name","shipping_address",
          "subtotal","tax_amount","total","tax_mode","payment_method","payment_status","status","paid_at"
        ) VALUES ($1,$2,'buyer@example.com','A Buyer','{"postcode":"AB1 2DE","line1":"1 Road","city":"Exampletown","country":"GB"}',
          '100.00','20.00','120.00','EXCLUSIVE','BANK_TRANSFER','PAID',$3,CURRENT_TIMESTAMP)`,
        [id, `DW-${id}`, status],
      )
      await client.query(
        `INSERT INTO "shp_order_items" (
          "id","order_id","product_name","product_type","quantity","unit_price","tax_rate","tax_amount","total"
        ) VALUES ($1,$2,'Desk','PHYSICAL',1,'100.00','0.2000','20.00','100.00')`,
        [`item-${id}`, id],
      )
    }
    await client.query(
      `INSERT INTO "shp_order_items" (
        "id","order_id","product_name","product_type","quantity","unit_price","tax_rate","tax_amount","total"
      ) VALUES ('item-ord-two-b','ord-two','Chair','PHYSICAL',2,'50.00','0.2000','20.00','100.00')`,
    )
  }, 300_000)

  afterAll(async () => {
    await import('@/lib/db/prisma')
      .then((module) => module.prisma.$disconnect())
      .catch(() => undefined)
    await client?.end().catch(() => undefined)
    if (server) {
      await dropTestDatabase(server, databaseName).catch(() => undefined)
      await dropTestRole(server, roleName).catch(() => undefined)
    }
  }, 120_000)

  beforeEach(() => {
    for (const mock of [dispatchEmail, trackingEmail, slotEmail, notify]) mock.mockReset()
    settings.mode = 'record'
  })

  it('off leaves the order alone', async () => {
    settings.mode = 'off'
    expect(await observer.observeDespatchRecorded(event('ord-off'))).toBe('off')
    expect(await parcels('ord-off')).toHaveLength(0)
  })

  it('record: a new parcel with the DPD link and its code, the order dispatched, nobody emailed', async () => {
    expect(await observer.observeDespatchRecorded(event('ord-new'))).toBe('created')
    const rows = await parcels('ord-new')
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      tracking_number: '12345678901234', tracking_url: 'https://www.dpd.co.uk/d/AbC123dEf456',
      tracking_short_code: 'AbC123dEf456', courier_id: 'dpd', carrier: 'DPD', items: 1,
      // B3: recorded in "record", so quiet.
      quiet_customer_emails: true,
    })
    const order = (await client.query(`SELECT "status" FROM "shp_orders" WHERE "id" = 'ord-new'`)).rows[0]
    expect(order.status).toBe('SHIPPED')
    expect(dispatchEmail).not.toHaveBeenCalled()

    // The same announcement again: nothing.
    expect(await observer.observeDespatchRecorded(event('ord-new'))).toBe('same')
    expect(await parcels('ord-new')).toHaveLength(1)
  })

  it('makes one parcel of two announcements arriving at once, the guard working under the lock', async () => {
    settings.mode = 'record-and-tell'
    const settled = await Promise.allSettled([
      observer.observeDespatchRecorded(event('ord-race'), { pauseMs: 50 }),
      observer.observeDespatchRecorded(event('ord-race'), { pauseMs: 50 }),
      observer.observeDespatchRecorded(event('ord-race', { trackingNumber: '1234 5678 901 234' }), { pauseMs: 50 }),
    ])
    // Exactly one of them makes the parcel. Each of the others, depending on
    // how they interleave, finds it already there ('same', or 'updated' had it
    // a day to add) or is still turned away by the busy order after its few
    // retries - which throws, so the announcer would offer it again. Under
    // load any of those is right; a second parcel never is.
    const outcomes = settled.map((r) => (r.status === 'fulfilled' ? r.value : (r.reason as Error).name))
    expect(outcomes.filter((o) => o === 'created')).toHaveLength(1)
    for (const outcome of outcomes.filter((o) => o !== 'created')) {
      expect(['same', 'updated', 'DespatchNotYetRecorded']).toContain(outcome)
    }
    expect(await parcels('ord-race')).toHaveLength(1)
    // The offer the announcer would make again finds it done.
    expect(await observer.observeDespatchRecorded(event('ord-race'), { pauseMs: 50 })).toBe('same')
    expect(await parcels('ord-race')).toHaveLength(1)
    expect((await parcels('ord-race'))[0]!.quiet_customer_emails).toBe(false)
    expect(dispatchEmail).toHaveBeenCalledTimes(1)

    // And straight at the guard: the spaced number is the same parcel.
    const again = await shipments.createShipment({
      orderId: 'ord-race',
      items: [{ orderItemId: 'item-ord-race', quantity: 1 }],
      unlessTrackingOnOrder: { trackingNumber: '1234-5678-901-234', trackingShortCode: null, trackingUrl: null },
    })
    expect(again).toMatchObject({ ok: false, code: 'duplicate' })
  })

  it('fills a parcel that went out blank, once, and record-and-tell sends the tracking email', async () => {
    settings.mode = 'record-and-tell'
    const blank = await shipments.createShipment({ orderId: 'ord-blank', items: [{ orderItemId: 'item-ord-blank', quantity: 1 }] })
    expect(blank.ok).toBe(true)
    const results = await Promise.all([
      observer.observeDespatchRecorded(event('ord-blank'), { pauseMs: 20 }),
      observer.observeDespatchRecorded(event('ord-blank', { trackingNumber: '99998888777766', trackingUrl: null, trackingShortCode: null }), { pauseMs: 20 }),
    ])
    // One of the two filled it; the other found its lines gone under other
    // tracking and left it alone. Never both, never an overwrite.
    expect(results.filter((r) => r === 'filled')).toHaveLength(1)
    expect(results.filter((r) => r === 'refused')).toHaveLength(1)
    const rows = await parcels('ord-blank')
    expect(rows).toHaveLength(1)
    expect(['12345678901234', '99998888777766']).toContain(rows[0]!.tracking_number)
    expect(trackingEmail).toHaveBeenCalledTimes(1)

    // The guarded fill on its own: a parcel with tracking is not blank.
    expect(await shipments.fillBlankShipmentTracking(rows[0]!.id, 'ord-blank', {
      trackingNumber: 'X', trackingUrl: null, trackingShortCode: null, carrier: null, courierId: null,
    })).toBe(false)
  })

  it('puts a confirmed window on the parcel; only a parcel recorded in record-and-tell emails it, once', async () => {
    const window = event('ord-new', { change: 'update', deliveryDate: '2026-10-06', deliverySlot: ['10:00', '13:00'] })
    expect(await observer.observeDespatchRecorded(window)).toBe('updated')
    let row = (await parcels('ord-new'))[0]!
    expect(row).toMatchObject({ delivery_date: '2026-10-06', delivery_slot_start: '10:00', delivery_slot_end: '13:00', slot_notified_at: null })
    expect(slotEmail).not.toHaveBeenCalled()

    // The quiet parcel stays quiet when the setting is switched to tell: no
    // going back to email about it, and no once-only stamp used up either.
    settings.mode = 'record-and-tell'
    expect(await observer.observeDespatchRecorded({ ...window, deliverySlot: ['11:00', '14:00'] })).toBe('updated')
    row = (await parcels('ord-new'))[0]!
    expect(row.slot_notified_at).toBeNull()
    expect(slotEmail).not.toHaveBeenCalled()

    // A parcel recorded in record-and-tell is told, once.
    const moved = event('ord-race', { change: 'update', deliveryDate: '2026-10-06', deliverySlot: ['14:00', '17:00'] })
    expect(await observer.observeDespatchRecorded(moved)).toBe('updated')
    row = (await parcels('ord-race'))[0]!
    expect(row.delivery_slot_start).toBe('14:00')
    expect(row.slot_notified_at).not.toBeNull()
    expect(slotEmail).toHaveBeenCalledTimes(1)
    expect(await observer.observeDespatchRecorded(moved)).toBe('same')
    expect(slotEmail).toHaveBeenCalledTimes(1)
  })

  it('B3: a quiet order still completes when it lands, without the completion email; the dispatch note lets it speak', async () => {
    expect(await shipments.orderHasQuietShipment('ord-new')).toBe(true)
    const id = (await parcels('ord-new'))[0]!.id as string
    await client.query(`UPDATE "shp_shipments" SET "delivered_at" = CURRENT_TIMESTAMP WHERE "id" = $1`, [id])
    expect(await autoComplete.completeOrderIfEveryParcelArrived('ord-new')).toBe(true)
    expect((await client.query(`SELECT "status" FROM "shp_orders" WHERE "id" = 'ord-new'`)).rows[0].status).toBe('COMPLETED')
    expect(notify).not.toHaveBeenCalled()

    // "Send dispatch note": the flag comes off once, for one caller.
    const released = await Promise.all([shipments.releaseQuietShipment(id, 'ord-new'), shipments.releaseQuietShipment(id, 'ord-new')])
    expect(released.filter(Boolean)).toHaveLength(1)
    expect(await shipments.orderHasQuietShipment('ord-new')).toBe(false)
  })

  it('B3 + N7: in "record", filling a blank parcel makes it quiet, and the rest of the announcement gets a parcel of its own', async () => {
    const blank = await shipments.createShipment({ orderId: 'ord-two', items: [{ orderItemId: 'item-ord-two', quantity: 1 }] })
    expect(blank.ok).toBe(true)
    const both = event('ord-two', {
      lines: [{ sourceOrderItemId: 'item-ord-two', qty: 1 }, { sourceOrderItemId: 'item-ord-two-b', qty: 2 }],
      trackingNumber: '55554444333322', trackingUrl: null, trackingShortCode: null,
    })
    expect(await observer.observeDespatchRecorded(both)).toBe('filled')
    const rows = await parcels('ord-two')
    expect(rows).toHaveLength(2)
    expect(rows.map((r) => [r.tracking_number, r.quiet_customer_emails, r.items])).toEqual([
      ['55554444333322', true, 1],
      ['55554444333322', true, 1],
    ])
    expect((await client.query(`SELECT "status" FROM "shp_orders" WHERE "id" = 'ord-two'`)).rows[0].status).toBe('SHIPPED')
    expect(dispatchEmail).not.toHaveBeenCalled()
    expect(trackingEmail).not.toHaveBeenCalled()
    // Switching to tell does not go back and tell anybody about them.
    settings.mode = 'record-and-tell'
    expect(await observer.observeDespatchRecorded({ ...both, change: 'update', deliveryDate: '2026-10-08', deliverySlot: ['09:00', '12:00'] })).toBe('updated')
    expect(slotEmail).not.toHaveBeenCalled()
  })

  it('refuses a cancelled order, and lines already gone under other tracking', async () => {
    expect(await observer.observeDespatchRecorded(event('ord-cancelled'))).toBe('refused')
    expect(await parcels('ord-cancelled')).toHaveLength(0)

    const sent = await shipments.createShipment({
      orderId: 'ord-other', items: [{ orderItemId: 'item-ord-other', quantity: 1 }], trackingNumber: 'OWN-TRACKING-1',
    })
    expect(sent.ok).toBe(true)
    expect(await observer.observeDespatchRecorded(event('ord-other'))).toBe('refused')
    const rows = await parcels('ord-other')
    expect(rows).toHaveLength(1)
    expect(rows[0]!.tracking_number).toBe('OWN-TRACKING-1')
  })
})
