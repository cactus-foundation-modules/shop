import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
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
import { newConsignmentParcel } from '@/modules/shop/lib/consignment-parcels'

// The boxes a parcel travels as (migration 074), against a real Postgres.
//
// recordConsignment is raw SQL that no typecheck, lint or build runs: a jsonb
// write from a JSON string, a clear back to NULL, and the order scope. Run
// here, read back through the row mapper, and the migration applied a second
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

suite('a parcel in several boxes, against a real database', () => {
  let server: TestServer
  let role: TestRole
  let client: Client
  const databaseName = `cactus_rt_shopboxes_${process.pid}`
  const roleName = `cactus_rt_role_shopboxes_${process.pid}`

  let shipments: typeof import('./shipments')

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
    // 074 a second time, as an install that already has it would.
    await client.query(readFileSync(join(directory, '074_consignment_parcels.sql'), 'utf8'))

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

  const boxes = [
    { ...newConsignmentParcel('15505217099684*21473', '1550 5217 099 684 K', '6dPoGbFMMrsp'), delivered: true, deliveredAt: '2026-10-16T11:06:00.000Z', receivedBy: 'Lee' },
    newConsignmentParcel('15505217099687*21473', '1550 5217 099 687 E'),
  ]

  it('starts as never asked', async () => {
    const parcel = (await shipments.getShipmentsForOrder('ord-1'))[0]
    expect(parcel?.consignmentNumber).toBeNull()
    expect(parcel?.consignmentParcels).toBeNull()
  })

  it('writes the boxes and reads them back through the row mapper', async () => {
    await shipments.recordConsignment('shp-1', { number: '5217099684', parcels: boxes }, 'ord-1')
    const parcel = (await shipments.getShipmentsForOrder('ord-1'))[0]
    expect(parcel?.consignmentNumber).toBe('5217099684')
    expect(parcel?.consignmentParcels).toEqual(boxes)
    const raw = (await client.query(`SELECT jsonb_typeof("consignment_parcels") AS kind FROM "shp_shipments" WHERE "id" = 'shp-1'`)).rows[0]
    expect(raw?.kind).toBe('array')
  })

  it('will not write through another order', async () => {
    await shipments.recordConsignment('shp-1', null, 'ord-other')
    expect((await shipments.getShipmentsForOrder('ord-1'))[0]?.consignmentParcels).toEqual(boxes)
  })

  it('clears back to never asked, from the tracking side too', async () => {
    await shipments.recordConsignment('shp-1', null)
    const parcel = (await shipments.getShipmentsForOrder('ord-1'))[0]
    expect(parcel?.consignmentNumber).toBeNull()
    expect(parcel?.consignmentParcels).toBeNull()
  })

  it('reopens a parcel called delivered, only on its own order, and only once', async () => {
    // Also: a parcel with only a name on it (DW000231 after its first reopen).
    await client.query(`UPDATE "shp_shipments" SET "delivered_at" = CURRENT_TIMESTAMP, "carrier_out_for_delivery" = true,
      "signed_by" = 'Lee', "signed_at" = CURRENT_TIMESTAMP, "signature_url" = 'https://media/x.jpg', "signature_key" = 'x' WHERE "id" = 'shp-1'`)
    expect(await shipments.reopenShipmentDelivery('shp-1', 'ord-other')).toBe(false)
    expect(await shipments.reopenShipmentDelivery('shp-1', 'ord-1')).toBe(true)
    const parcel = (await shipments.getShipmentsForOrder('ord-1'))[0]
    expect(parcel?.deliveredAt).toBeNull()
    expect(parcel?.carrierOutForDelivery).toBeNull()
    expect(parcel).toMatchObject({ signedBy: null, signedAt: null, signatureUrl: null, signatureKey: null })
    expect(await shipments.reopenShipmentDelivery('shp-1', 'ord-1')).toBe(false)
    expect(await shipments.listOrdersAwaitingCompletion(10)).not.toContain('ord-1')
    await client.query(`UPDATE "shp_shipments" SET "signed_by" = 'Lee' WHERE "id" = 'shp-1'`)
    expect(await shipments.reopenShipmentDelivery('shp-1', 'ord-1')).toBe(true)
    expect((await shipments.getShipmentsForOrder('ord-1'))[0]?.signedBy).toBeNull()
  })
})
