import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
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

// Reported delivery delays (migration 070), against a real Postgres.
//
// Every write in lib/db/shipments.ts that a delay goes through is raw SQL no
// typecheck, lint or build runs: recording each kind of delay, the new day it
// promised, taking one back, a new day typed in closing one (or not), the
// window email's stamp, and the courier's own booking answering one. Run here
// one by one, on one parcel reset between cases, and the migration a second
// time as an install that already has it would.
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

suite('reported delivery delays, against a real database', () => {
  let server: TestServer
  let role: TestRole
  let client: Client
  const databaseName = `cactus_rt_shopdelay_${process.pid}`
  const roleName = `cactus_rt_role_shopdelay_${process.pid}`

  let shipments: typeof import('./shipments')

  async function row() {
    return (await client.query(
      `SELECT "delivery_date","delivery_slot_start","delivery_slot_end","slot_notified_at",
              "delivery_delay","delivery_delayed_at","delivery_delayed_from","delivery_delay_note"
         FROM "shp_shipments" WHERE "id" = 'shp-1'`,
    )).rows[0]
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
    const directory = join(__dirname, '..', '..', 'migrations')
    for (const file of readdirSync(directory).filter((name) => name.endsWith('.sql')).sort()) {
      await client.query(readFileSync(join(directory, file), 'utf8'))
    }
    // 070 a second time, as an install that already has it would.
    await client.query(readFileSync(join(directory, '070_delivery_delays.sql'), 'utf8'))

    process.env.DATABASE_URL = uri
    shipments = await import('./shipments')

    await client.query(
      `INSERT INTO "shp_orders" (
        "id","order_number","customer_email","customer_name","shipping_address",
        "subtotal","tax_amount","total","tax_mode","payment_method","payment_status","status","paid_at"
      ) VALUES ('ord-1','DW-ord-1','buyer@example.com','A Buyer','{"postcode":"AB1 2DE","line1":"1 Road","city":"Exampletown","country":"GB"}',
        '100.00','20.00','120.00','EXCLUSIVE','BANK_TRANSFER','PAID','SHIPPED',CURRENT_TIMESTAMP)`,
    )
    await client.query(`INSERT INTO "shp_shipments" ("id","order_id") VALUES ('shp-1','ord-1')`)
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

  // Booked for the 9th, 10:00-13:00, and the customer told the window.
  beforeEach(async () => {
    await client.query(
      `UPDATE "shp_shipments" SET
         "delivery_date" = '2026-10-09', "delivery_slot_start" = '10:00', "delivery_slot_end" = '13:00',
         "slot_notified_at" = CURRENT_TIMESTAMP, "delivered_at" = NULL,
         "delivery_delay" = NULL, "delivery_delayed_at" = NULL, "delivery_delayed_from" = NULL, "delivery_delay_note" = NULL
       WHERE "id" = 'shp-1'`,
    )
  })

  it('running late keeps the booking and its stamp', async () => {
    expect(await shipments.recordDeliveryDelay('shp-1', 'ord-1', { kind: 'today', missedDay: '2026-10-09', note: 'Van held up' })).toBe(true)
    expect(await row()).toMatchObject({
      delivery_delay: 'today', delivery_delayed_from: '2026-10-09', delivery_delay_note: 'Van held up',
      delivery_date: '2026-10-09', delivery_slot_start: '10:00', delivery_slot_end: '13:00',
    })
    expect((await row()).slot_notified_at).not.toBeNull()
    expect((await row()).delivery_delayed_at).not.toBeNull()
  })

  it('a new day to follow clears the booking and the stamp', async () => {
    await shipments.recordDeliveryDelay('shp-1', 'ord-1', { kind: 'rebooking', missedDay: '2026-10-09', note: null })
    expect(await row()).toMatchObject({
      delivery_delay: 'rebooking', delivery_date: null, delivery_slot_start: null, delivery_slot_end: null,
      slot_notified_at: null, delivery_delay_note: null,
    })
  })

  it('a new day known: stamped only when the email carrying the window goes', async () => {
    await shipments.recordDeliveryDelay('shp-1', 'ord-1', {
      kind: 'new-date', missedDay: '2026-10-09', note: null,
      newDate: '2026-10-13', slotStart: '08:00', slotEnd: '12:00', told: true,
    })
    expect(await row()).toMatchObject({ delivery_delay: null, delivery_date: '2026-10-13', delivery_slot_start: '08:00', delivery_slot_end: '12:00' })
    expect((await row()).slot_notified_at).not.toBeNull()

    await shipments.recordDeliveryDelay('shp-1', 'ord-1', {
      kind: 'new-date', missedDay: '2026-10-09', note: null,
      newDate: '2026-10-14', slotStart: '08:00', slotEnd: '12:00', told: false,
    })
    expect((await row()).slot_notified_at).toBeNull()

    await shipments.recordDeliveryDelay('shp-1', 'ord-1', { kind: 'new-date', missedDay: '2026-10-09', note: null, newDate: '2026-10-15', told: true })
    expect(await row()).toMatchObject({ delivery_date: '2026-10-15', delivery_slot_start: null, slot_notified_at: null })
  })

  it('the promised new day closes the delay and keeps its history', async () => {
    await shipments.recordDeliveryDelay('shp-1', 'ord-1', { kind: 'rebooking', missedDay: '2026-10-09', note: 'Stock late' })
    await shipments.recordDelayedParcelNewDate('shp-1', 'ord-1', { newDate: '2026-10-13', slotStart: null, slotEnd: null, told: true })
    expect(await row()).toMatchObject({
      delivery_delay: null, delivery_date: '2026-10-13', delivery_delayed_from: '2026-10-09', delivery_delay_note: 'Stock late', slot_notified_at: null,
    })
  })

  it('taking a delay back clears all of it', async () => {
    await shipments.recordDeliveryDelay('shp-1', 'ord-1', { kind: 'today', missedDay: '2026-10-09', note: 'x' })
    expect(await shipments.clearDeliveryDelay('shp-1', 'ord-1')).toBe(true)
    expect(await row()).toMatchObject({ delivery_delay: null, delivery_delayed_at: null, delivery_delayed_from: null, delivery_delay_note: null })
    expect(await shipments.clearDeliveryDelay('shp-1', 'ord-other')).toBe(false)
  })

  it('a day typed in closes a delay only when it is after the missed one', async () => {
    await shipments.recordDeliveryDelay('shp-1', 'ord-1', { kind: 'rebooking', missedDay: '2026-10-09', note: null })
    await shipments.updateShipmentDetails('shp-1', 'ord-1', { deliveryDate: '2026-10-09' })
    expect((await row()).delivery_delay).toBe('rebooking')
    await shipments.updateShipmentDetails('shp-1', 'ord-1', { deliveryDate: '2026-10-13' })
    expect((await row()).delivery_delay).toBeNull()
    // Never the stamp: that is newDayAfterDelay's to decide.
    expect((await row()).slot_notified_at).toBeNull()
  })

  it('sets the window stamp outright either way', async () => {
    await shipments.setSlotNotification('shp-1', 'ord-1', false)
    expect((await row()).slot_notified_at).toBeNull()
    await shipments.setSlotNotification('shp-1', 'ord-1', true)
    expect((await row()).slot_notified_at).not.toBeNull()
  })

  it('the courier booking a later day answers a delay exactly once', async () => {
    await shipments.recordDeliveryDelay('shp-1', 'ord-1', { kind: 'today', missedDay: '2026-10-09', note: null })
    expect(await shipments.claimDelayAnsweredByCourier('shp-1', '2026-10-09')).toBe(false)
    expect(await shipments.claimDelayAnsweredByCourier('shp-1', '2026-10-13')).toBe(true)
    expect(await row()).toMatchObject({ delivery_delay: null, delivery_date: '2026-10-13', delivery_slot_start: null, delivery_slot_end: null })
    expect((await row()).slot_notified_at).not.toBeNull()
    expect(await shipments.claimDelayAnsweredByCourier('shp-1', '2026-10-14')).toBe(false)
  })

  it('the courier answers nothing on a completed order', async () => {
    await shipments.recordDeliveryDelay('shp-1', 'ord-1', { kind: 'today', missedDay: '2026-10-09', note: null })
    await client.query(`UPDATE "shp_orders" SET "status" = 'COMPLETED' WHERE "id" = 'ord-1'`)
    try {
      expect(await shipments.claimDelayAnsweredByCourier('shp-1', '2026-10-13')).toBe(false)
      expect((await row()).delivery_delay).toBe('today')
    } finally {
      await client.query(`UPDATE "shp_orders" SET "status" = 'SHIPPED' WHERE "id" = 'ord-1'`)
    }
  })

  it('refuses anything but the two delay words and a real day shape', async () => {
    await expect(client.query(`UPDATE "shp_shipments" SET "delivery_delay" = 'soon' WHERE "id" = 'shp-1'`)).rejects.toThrow(/delivery_delay_check/)
    await expect(client.query(`UPDATE "shp_shipments" SET "delivery_delayed_from" = '9/10/26' WHERE "id" = 'shp-1'`)).rejects.toThrow(/delivery_delay_check/)
  })

  it('reads the delay back through the row mapper', async () => {
    await shipments.recordDeliveryDelay('shp-1', 'ord-1', { kind: 'today', missedDay: '2026-10-09', note: 'Late' })
    const parcel = (await shipments.getShipmentsForOrder('ord-1'))[0]
    expect(parcel).toMatchObject({ deliveryDelay: 'today', deliveryDelayedFrom: '2026-10-09', deliveryDelayNote: 'Late' })
    expect(parcel?.deliveryDelayedAt).toBeInstanceOf(Date)
  })
})
