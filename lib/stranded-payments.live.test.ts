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

// The alarm for a payment that was taken where the order could not be written,
// against a real Postgres.
//
// It has to be a real one. Every statement in lib/stranded-payments.ts is raw
// SQL, and raw SQL is the one thing `tsc`, `eslint` and the module build gate
// have nothing to say about - an INSERT ... SELECT feeding an ON CONFLICT clause
// that names a constraint which is not there typechecks perfectly and then does
// nothing at all on the first real failure. Nothing would notice, because the
// only time this code ever runs is when something else has already gone wrong.
//
// The end-to-end case at the bottom is the one that matters: a genuine failure
// inside materialiseDraftOrder's transaction, proving the rollback leaves the
// draft alone AND that the record survives the rollback that erased everything
// else. That is the exact shape of 2026-09-09, when a shop took £193.20 for an
// order it could not write and the only detector was the customer's telephone.
//
// Gated like the other live suites, on the same OVH server. Databases are named
// cactus_rt_* and dropped afterwards; nothing else there is ever touched.
const ENABLED = process.env.RUN_LEDGER_GUARDS === '1' || process.env.RUN_BACKUP_ROUNDTRIP === '1'
if (ENABLED) {
  try {
    ;(process as unknown as { loadEnvFile: (path: string) => void }).loadEnvFile('.env')
  } catch {
    // No .env - testServerFromEnv below fails the suite loudly rather than here.
  }
}
const suite = ENABLED ? describe : describe.skip

suite('stranded payments, against a real database', () => {
  let server: TestServer
  let role: TestRole
  let client: Client
  const databaseName = `cactus_rt_stranded_${process.pid}`
  const roleName = `cactus_rt_role_stranded_${process.pid}`

  let stranded: typeof import('./stranded-payments')
  let drafts: typeof import('./checkout-draft')

  // Money as NUMBERS, exactly as a real draft carries it - a live payload reads
  // "total": 193.2, "subtotal": 161. Writing them as strings here passed every
  // local check and then failed on the real database with `column "subtotal" is
  // of type numeric but expression is of type text`, which is precisely the
  // class of thing this suite exists to catch.
  const draftPayload = (id: string, orderNumber: string) => ({
    id,
    orderNumber,
    customerEmail: 'buyer@example.com',
    customerName: 'A Buyer',
    customerPhone: null,
    shippingAddress: { postcode: 'E1 1AA' },
    billingAddress: null,
    subtotal: 100,
    discountAmount: 0,
    shippingAmount: 0,
    taxAmount: 20,
    total: 120,
    taxMode: 'EXCLUSIVE',
    currency: 'GBP',
    couponId: null,
    couponCode: null,
    paymentMethod: 'SQUARE',
    shippingRateId: null,
    shippingRateName: null,
    memberId: null,
    agreements: null,
    items: [
      {
        productId: null,
        productName: 'Chair',
        productSku: 'SKU1',
        productType: 'PHYSICAL',
        quantity: 1,
        unitPrice: 100,
        taxRate: 0.2,
        taxAmount: 20,
        total: 100,
        isPreOrder: false,
        preOrderDispatchDate: null,
      },
    ],
  })

  async function insertDraft(id: string, orderNumber: string) {
    await client.query(
      `INSERT INTO "shp_checkout_drafts" (
         "id","order_number","payment_method","customer_email","customer_name",
         "total","currency","payload","expires_at"
       ) VALUES ($1,$2,'SQUARE','buyer@example.com','A Buyer','120.00','GBP',$3::jsonb, NOW() + INTERVAL '30 days')`,
      [id, orderNumber, JSON.stringify(draftPayload(id, orderNumber))],
    )
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
    stranded = await import('./stranded-payments')
    drafts = await import('./checkout-draft')
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

  it('copies the customer and the money off the draft it could not turn into an order', async () => {
    await insertDraft('draft-1', 'DW000901')
    await stranded.recordStrandedPayment('draft-1', new Error('column "x" does not exist'))

    const rows = await stranded.listStrandedPayments()
    const row = rows.find((r) => r.draftId === 'draft-1')
    expect(row).toBeDefined()
    expect(row?.orderNumber).toBe('DW000901')
    expect(row?.paymentMethod).toBe('SQUARE')
    expect(row?.customerEmail).toBe('buyer@example.com')
    // NUMERIC(10,2) comes back through Prisma's Decimal, whose toString() drops
    // the trailing zeros - '120', not '120.00'. Every other money mapper in the
    // shop reads it the same way and formatMoney renders it to two places, so
    // the value is what matters here rather than its spelling.
    expect(Number(row?.total)).toBe(120)
    expect(row?.error).toContain('column "x" does not exist')
    expect(row?.attempts).toBe(1)
  })

  it('counts a retrying webhook instead of filling the screen with copies of it', async () => {
    await stranded.recordStrandedPayment('draft-1', new Error('still broken'))
    await stranded.recordStrandedPayment('draft-1', new Error('still broken'))

    const rows = await stranded.listStrandedPayments()
    const mine = rows.filter((r) => r.draftId === 'draft-1')
    expect(mine).toHaveLength(1)
    expect(mine[0]?.attempts).toBe(3)
    // The newest error wins: the current failure is more useful than the first.
    expect(mine[0]?.error).toContain('still broken')
  })

  it('clears itself when the order finally does get made', async () => {
    await stranded.clearStrandedPayment('draft-1')
    const rows = await stranded.listStrandedPayments()
    expect(rows.some((r) => r.draftId === 'draft-1')).toBe(false)
  })

  it('says nothing at all about a draft that does not exist', async () => {
    // A settlement for something this shop has no record of. There is nothing to
    // copy and nothing worth inventing, and it must not throw on the way past.
    await expect(stranded.recordStrandedPayment('no-such-draft', new Error('boom'))).resolves.toBeUndefined()
    expect(await stranded.countStrandedPayments()).toBe(0)
  })

  it('records a real failure inside materialiseDraftOrder, and leaves the draft where it was', async () => {
    // A genuine, unfaked failure of the create transaction: the draft carries an
    // order number another order already has, so the INSERT trips the unique
    // constraint exactly as a missing column would have.
    await client.query(
      `INSERT INTO "shp_orders" (
         "id","order_number","customer_email","customer_name","shipping_address",
         "subtotal","total","tax_mode","payment_method"
       ) VALUES ('taken','DW000902','someone@example.com','Someone','{"postcode":"E1 1AA"}','1.00','1.00','EXCLUSIVE','SQUARE')`,
    )
    await insertDraft('draft-2', 'DW000902')

    await expect(drafts.materialiseDraftOrder('draft-2')).rejects.toThrow()

    const rows = await stranded.listStrandedPayments()
    const row = rows.find((r) => r.draftId === 'draft-2')
    expect(row).toBeDefined()
    expect(row?.orderNumber).toBe('DW000902')
    expect(Number(row?.total)).toBe(120)

    // The draft has to survive: it is the only copy of what the customer bought,
    // and the recovery in an incident is to settle it again once the cause is
    // fixed. The rollback that erased the order must not have taken it.
    const { rows: draftRows } = await client.query(`SELECT "id" FROM "shp_checkout_drafts" WHERE "id" = 'draft-2'`)
    expect(draftRows).toHaveLength(1)
  })

  it('clears the record when that same draft is settled successfully afterwards', async () => {
    // The collision is gone - the same recovery an owner performs after fixing
    // the cause - so the retry that follows both creates the order and takes the
    // alarm down with it.
    await client.query(`UPDATE "shp_orders" SET "order_number" = 'DW000903' WHERE "id" = 'taken'`)

    const order = await drafts.materialiseDraftOrder('draft-2')
    expect(order?.orderNumber).toBe('DW000902')

    const rows = await stranded.listStrandedPayments()
    expect(rows.some((r) => r.draftId === 'draft-2')).toBe(false)
  })
})
