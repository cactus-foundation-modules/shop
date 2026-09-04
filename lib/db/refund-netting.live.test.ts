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

// The refund-netting queries, against a real Postgres.
//
// invoice-net-of-refunds.test.ts covers the arithmetic and touches no database,
// which is the point of it and also its limit. Everything here is raw SQL, and
// raw SQL is what `tsc`, `eslint` and the module build gate all have nothing
// whatever to say about: a mis-cast array parameter, a join that will not
// compose, a NULL comparison that quietly matches nothing. Each of those type-
// checks perfectly and then fails on the first real request - and the failure
// here would be an invoice raised for money that has already gone back.
//
// So the queries are run. Gated the same way the ledger and backup suites are,
// and for the same reason: it needs the OVH server. The databases it makes are
// named cactus_rt_* and dropped afterwards; nothing else on that server is ever
// named, opened or altered.
const ENABLED = process.env.RUN_LEDGER_GUARDS === '1' || process.env.RUN_BACKUP_ROUNDTRIP === '1'
if (ENABLED) {
  try {
    ;(process as unknown as { loadEnvFile: (path: string) => void }).loadEnvFile('.env')
  } catch {
    // No .env - testServerFromEnv below fails the suite loudly rather than here.
  }
}
const suite = ENABLED ? describe : describe.skip

suite('refund netting, against a real database', () => {
  let server: TestServer
  let role: TestRole
  let client: Client
  const databaseName = `cactus_rt_shopnet_${process.pid}`
  const roleName = `cactus_rt_role_shopnet_${process.pid}`

  // Imported after DATABASE_URL is set, because lib/db/prisma reads it when the
  // client is built. A static import would bind to whatever the environment held
  // at collection time, which is nothing.
  let refunds: typeof import('./refunds')

  beforeAll(async () => {
    server = testServerFromEnv()
    await dropStaleTestObjects(server)
    role = await createTestRole(server, roleName)
    await createTestDatabase(server, databaseName, role)

    const uri = connectionUri(server, databaseName, role)
    client = new Client({ connectionString: `${uri}&uselibpqcompat=true` })
    await client.connect()
    await client.query('CREATE EXTENSION IF NOT EXISTS pgcrypto')

    // Core's schema first: a couple of the shop's migrations reach for core
    // tables (Layout, for the starter pages it seeds), so a shop-only database
    // stops on the first of them.
    const coreInit = join(process.cwd(), 'prisma', 'migrations', '20260626000000_init', 'migration.sql')
    await client.query(readFileSync(coreInit, 'utf8'))

    // Then the shop's own migrations, in order and whole - triggers and $$
    // bodies included, which is why they go through pg rather than through the
    // statement splitter the backup round-trip uses.
    const directory = join(__dirname, '..', '..', 'migrations')
    for (const file of readdirSync(directory).filter((name) => name.endsWith('.sql')).sort()) {
      await client.query(readFileSync(join(directory, file), 'utf8'))
    }

    process.env.DATABASE_URL = uri
    refunds = await import('./refunds')

    await client.query(`
      INSERT INTO "shp_orders" (
        "id","order_number","customer_email","customer_name","shipping_address",
        "subtotal","total","tax_mode","payment_method"
      ) VALUES ('ord-1','ORD-1','buyer@example.com','A Buyer','{}','200.00','240.00','EXCLUSIVE','STRIPE')
    `)
    await client.query(`
      INSERT INTO "shp_order_items" (
        "id","order_id","product_name","product_type","quantity","unit_price","tax_rate","tax_amount","total"
      ) VALUES
        ('item-a','ord-1','Chair','PHYSICAL',1,'100.00','0.2000','20.00','100.00'),
        ('item-b','ord-1','Desk','PHYSICAL',1,'100.00','0.2000','20.00','100.00')
    `)
    // Three settled refunds: one to be netted off, one already credited, one
    // still waiting. Plus a failed one, which is not money that moved.
    await client.query(`
      INSERT INTO "shp_refunds" ("id","order_id","amount","status","created_by")
      VALUES ('ref-netted','ord-1','120.00','COMPLETED','staff-1'),
             ('ref-credited','ord-1','120.00','COMPLETED','staff-1'),
             ('ref-open','ord-1','60.00','COMPLETED','staff-1'),
             ('ref-failed','ord-1','60.00','FAILED','staff-1')
    `)
    await client.query(`
      INSERT INTO "shp_refund_items" ("refund_id","order_item_id","quantity","amount")
      VALUES ('ref-netted','item-b',1,'120.00'),
             ('ref-credited','item-a',1,'120.00'),
             ('ref-open','item-a',1,'60.00'),
             ('ref-failed','item-a',1,'60.00')
    `)
    await client.query(`
      INSERT INTO "shp_credit_notes" (
        "id","order_id","credit_note_number","refund_id","tax_point_date",
        "currency","tax_mode","total"
      ) VALUES ('cn-1','ord-1','CN-1','ref-credited','2026-09-01','GBP','EXCLUSIVE','120.00')
    `)
  }, 300_000)

  afterAll(async () => {
    // Prisma's pool goes first. Dropping the database out from under a live
    // connection works, but the FATAL it logs on the way out reads like a test
    // failure to anybody scanning the output.
    await import('@/lib/db/prisma')
      .then((module) => module.prisma.$disconnect())
      .catch(() => undefined)
    await client?.end().catch(() => undefined)
    if (server) {
      await dropTestDatabase(server, databaseName).catch(() => undefined)
      await dropTestRole(server, roleName).catch(() => undefined)
    }
  }, 120_000)

  it('lists only settled refunds that nothing has dealt with', async () => {
    const lines = await refunds.listUncreditedRefundLines('ord-1')
    expect(lines.map((line) => line.refundId).sort()).toEqual(['ref-netted', 'ref-open'])
    const netted = lines.find((line) => line.refundId === 'ref-netted')!
    expect(netted.orderItemId).toBe('item-b')
    expect(netted.quantity).toBe(1)
    // A NUMERIC column, read back as a two-decimal string rather than a float.
    expect(netted.amount).toBe('120.00')
    expect(netted.createdAt).toBeInstanceOf(Date)
  })

  it('marks refunds against the invoice that was raised without them', async () => {
    await refunds.markRefundsNettedOff(['ref-netted'], 'inv-1')

    const refund = await refunds.getRefundById('ref-netted')
    expect(refund?.nettedOffInvoiceId).toBe('inv-1')

    // And they drop out of the list, so a second invoice cannot take the same
    // money off twice.
    const lines = await refunds.listUncreditedRefundLines('ord-1')
    expect(lines.map((line) => line.refundId)).toEqual(['ref-open'])
  })

  it('lets one invoice its own marks back, which is what a reissue needs', async () => {
    const lines = await refunds.listUncreditedRefundLines('ord-1', 'inv-1')
    expect(lines.map((line) => line.refundId).sort()).toEqual(['ref-netted', 'ref-open'])

    // Somebody else's invoice does not get them.
    const other = await refunds.listUncreditedRefundLines('ord-1', 'inv-2')
    expect(other.map((line) => line.refundId)).toEqual(['ref-open'])
  })

  it('does nothing at all when handed no refunds', async () => {
    await refunds.markRefundsNettedOff([], 'inv-9')
    const refund = await refunds.getRefundById('ref-open')
    expect(refund?.nettedOffInvoiceId).toBeNull()
  })

  it('releases them again when the invoice that carried them is voided', async () => {
    await refunds.clearRefundsNettedOff('inv-1')

    const refund = await refunds.getRefundById('ref-netted')
    expect(refund?.nettedOffInvoiceId).toBeNull()

    const lines = await refunds.listUncreditedRefundLines('ord-1')
    expect(lines.map((line) => line.refundId).sort()).toEqual(['ref-netted', 'ref-open'])
  })
})
