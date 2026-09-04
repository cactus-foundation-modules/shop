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

// The guest order-access queries, against a real Postgres.
//
// order-lookup.test.ts covers the rules a customer's typing goes through and
// touches no database, which is the point of it and also its limit. Everything
// here is raw SQL, and raw SQL is the one thing `tsc`, `eslint` and the module
// build gate have nothing whatever to say about: an interval parameter Postgres
// cannot type, a CASE that reads a column another SET has already changed, an
// ON CONFLICT clause naming a constraint that is not there. Each of those
// typechecks perfectly and then fails on the first real request - and the
// failure here is the lock that is supposed to stop somebody guessing at a
// stranger's postcode, so it failing open is worse than it failing loudly.
//
// The lockout arithmetic is the reason this file exists rather than a mocked
// unit test. `failed_count` is incremented and read in one statement, twice, and
// whether the eighth wrong postcode locks the order depends entirely on
// Postgres giving both CASE expressions the row as it was BEFORE the update.
//
// Gated the same way the ledger and backup suites are, and for the same reason:
// it needs the OVH server. The databases it makes are named cactus_rt_* and
// dropped afterwards; nothing else on that server is ever named, opened or
// altered.
const ENABLED = process.env.RUN_LEDGER_GUARDS === '1' || process.env.RUN_BACKUP_ROUNDTRIP === '1'
if (ENABLED) {
  try {
    ;(process as unknown as { loadEnvFile: (path: string) => void }).loadEnvFile('.env')
  } catch {
    // No .env - testServerFromEnv below fails the suite loudly rather than here.
  }
}
const suite = ENABLED ? describe : describe.skip

suite('guest order access, against a real database', () => {
  let server: TestServer
  let role: TestRole
  let client: Client
  const databaseName = `cactus_rt_shopacc_${process.pid}`
  const roleName = `cactus_rt_role_shopacc_${process.pid}`

  // Imported after DATABASE_URL is set, because lib/db/prisma reads it when the
  // client is built. A static import would bind to whatever the environment held
  // at collection time, which is nothing.
  let access: typeof import('./order-access')
  let orders: typeof import('./orders')
  let requests: typeof import('./order-requests')

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
    // tables, so a shop-only database stops on the first of them.
    const coreInit = join(process.cwd(), 'prisma', 'migrations', '20260626000000_init', 'migration.sql')
    await client.query(readFileSync(coreInit, 'utf8'))

    const directory = join(__dirname, '..', '..', 'migrations')
    for (const file of readdirSync(directory).filter((name) => name.endsWith('.sql')).sort()) {
      await client.query(readFileSync(join(directory, file), 'utf8'))
    }

    process.env.DATABASE_URL = uri
    access = await import('./order-access')
    orders = await import('./orders')
    requests = await import('./order-requests')

    // Two orders numbered the way lib/order-number.ts numbers them, so the
    // candidate lookup has something real to resolve against.
    await client.query(`
      INSERT INTO "shp_orders" (
        "id","order_number","customer_email","customer_name","shipping_address",
        "subtotal","total","tax_mode","payment_method"
      ) VALUES
        ('ord-1','DW000172','buyer@example.com','A Buyer','{"postcode":"E1 1AA"}','100.00','120.00','EXCLUSIVE','BANK_TRANSFER'),
        ('ord-2','DW000173','other@example.com','B Buyer','{"postcode":"B29 7QB"}','100.00','120.00','EXCLUSIVE','BANK_TRANSFER')
    `)
    await client.query(`
      INSERT INTO "shp_order_items" (
        "id","order_id","product_name","product_type","quantity","unit_price","tax_rate","tax_amount","total"
      ) VALUES ('item-a','ord-1','Chair','PHYSICAL',1,'100.00','0.2000','20.00','100.00')
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

  it('is open on an order nobody has ever guessed at', async () => {
    expect(await access.getOrderAccessLock('ord-2')).toEqual({ locked: false, retryAfterSeconds: 0 })
  })

  it('counts wrong postcodes and locks on the eighth', async () => {
    for (let attempt = 1; attempt <= 7; attempt++) {
      const state = await access.recordOrderAccessFailure('ord-1')
      expect(state.locked, `attempt ${attempt} should not lock`).toBe(false)
    }

    const eighth = await access.recordOrderAccessFailure('ord-1')
    expect(eighth.locked).toBe(true)
    // An hour, give or take the time the seven statements above took.
    expect(eighth.retryAfterSeconds).toBeGreaterThan(3500)
    expect(eighth.retryAfterSeconds).toBeLessThanOrEqual(3600)

    // And a separate read agrees, which is what the route asks before it will
    // even look at the postcode.
    const seen = await access.getOrderAccessLock('ord-1')
    expect(seen.locked).toBe(true)
    expect(seen.retryAfterSeconds).toBeGreaterThan(3500)
  })

  it('locks that order and no other', async () => {
    expect((await access.getOrderAccessLock('ord-2')).locked).toBe(false)
  })

  it('forgets everything the moment somebody proves themselves', async () => {
    await access.clearOrderAccessFailures('ord-1')
    expect(await access.getOrderAccessLock('ord-1')).toEqual({ locked: false, retryAfterSeconds: 0 })

    const rows = await client.query('SELECT * FROM "shp_order_access_attempts" WHERE "order_id" = $1', ['ord-1'])
    expect(rows.rowCount).toBe(0)
  })

  // The reason the window exists: a customer who mistypes once a year must not
  // be locked out on their eighth order.
  it('starts the count again once the window has passed', async () => {
    for (let attempt = 0; attempt < 7; attempt++) await access.recordOrderAccessFailure('ord-1')
    await client.query(`
      UPDATE "shp_order_access_attempts"
      SET "updated_at" = CURRENT_TIMESTAMP - INTERVAL '2 hours'
      WHERE "order_id" = 'ord-1'
    `)

    const next = await access.recordOrderAccessFailure('ord-1')
    expect(next.locked).toBe(false)

    const rows = await client.query<{ failed_count: number }>(
      'SELECT "failed_count" FROM "shp_order_access_attempts" WHERE "order_id" = $1',
      ['ord-1'],
    )
    expect(rows.rows[0]?.failed_count).toBe(1)
  })

  it('sweeps rows nobody has touched, and leaves a live lock alone', async () => {
    await access.clearOrderAccessFailures('ord-1')
    await access.clearOrderAccessFailures('ord-2')

    // One stale row, one stale row still holding a lock.
    await client.query(`
      INSERT INTO "shp_order_access_attempts" ("order_id","failed_count","locked_until","updated_at")
      VALUES
        ('ord-1', 3, NULL, CURRENT_TIMESTAMP - INTERVAL '40 days'),
        ('ord-2', 9, CURRENT_TIMESTAMP + INTERVAL '30 minutes', CURRENT_TIMESTAMP - INTERVAL '40 days')
    `)

    await access.sweepOrderAccessAttempts()

    const left = await client.query<{ order_id: string }>('SELECT "order_id" FROM "shp_order_access_attempts"')
    expect(left.rows.map((row) => row.order_id)).toEqual(['ord-2'])

    await access.clearOrderAccessFailures('ord-2')
  })

  it('resolves an order number typed any of the ways a customer types it', async () => {
    // The candidates themselves are lib/order-lookup.ts's business; that this
    // IN-list composes and comes back mapped is this file's.
    const found = await orders.findOrdersByNumberCandidates(['DW000172', 'DW172', '172'])
    expect(found.map((order) => order.id)).toEqual(['ord-1'])
    expect(found[0]?.shippingAddress.postcode).toBe('E1 1AA')
  })

  it('has nothing to say about a number that is not there', async () => {
    expect(await orders.findOrdersByNumberCandidates(['DW999999'])).toEqual([])
    expect(await orders.findOrdersByNumberCandidates([])).toEqual([])
  })

  // Scoped to the ORDER now rather than to the member, which is what lets a
  // guest take back their own request - and what stops one order's request
  // being withdrawn from another order's page.
  it('withdraws a request against its own order and no other', async () => {
    const created = await requests.createOrderRequest({
      orderId: 'ord-1',
      memberId: null,
      type: 'CANCEL',
      reason: 'CHANGED_MIND',
    })
    expect(created.ok).toBe(true)
    if (!created.ok) return

    expect(await requests.withdrawRequest(created.request.id, 'ord-2')).toBe(false)
    expect(await requests.withdrawRequest(created.request.id, 'ord-1')).toBe(true)
    // And not twice: it is no longer PENDING.
    expect(await requests.withdrawRequest(created.request.id, 'ord-1')).toBe(false)

    const after = await requests.getRequestById(created.request.id)
    expect(after?.status).toBe('WITHDRAWN')
  })
})
