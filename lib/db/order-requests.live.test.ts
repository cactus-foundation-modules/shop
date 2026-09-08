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

// The cancel/return/damage queries, against a real Postgres.
//
// Everything this file covers is raw SQL, and raw SQL is the one thing `tsc`,
// `eslint` and the module build gate have nothing whatever to say about. Three
// of the statements here are the sort that typecheck perfectly and then fall
// over on the first real request:
//
//   - the CASE that decides whether a decision may carry a return charge, whose
//     parameter Postgres cannot type without a cast,
//   - the EXISTS that flags a request as the shop's to refuse, which reaches
//     across three tables and reads differently for a cancel,
//   - the two partial unique indexes that let a damage report sit alongside a
//     pending return without either one blocking the other.
//
// And the arithmetic underneath them is about money and about whether a
// customer can ask for something at all, which is the wrong pair of things to
// find out about in production.
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

suite('cancel, return and damage requests, against a real database', () => {
  let server: TestServer
  let role: TestRole
  let client: Client
  const databaseName = `cactus_rt_shopreq_${process.pid}`
  const roleName = `cactus_rt_role_shopreq_${process.pid}`

  // Imported after DATABASE_URL is set, because lib/db/prisma reads it when the
  // client is built. A static import would bind to whatever the environment held
  // at collection time, which is nothing.
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
    requests = await import('./order-requests')

    // One order, three lines: one the shop takes back, one it does not, and one
    // it will think about. Every rule in here turns on which is which.
    await client.query(`
      INSERT INTO "shp_orders" (
        "id","order_number","customer_email","customer_name","shipping_address",
        "subtotal","total","tax_mode","payment_method"
      ) VALUES ('ord-1','DW000200','buyer@example.com','A Buyer','{"postcode":"E1 1AA"}','300.00','360.00','EXCLUSIVE','BANK_TRANSFER')
    `)
    await client.query(`
      INSERT INTO "shp_order_items" (
        "id","order_id","product_name","product_type","quantity","unit_price","tax_rate","tax_amount","total",
        "returnable","returns_discretionary","non_returnable_note"
      ) VALUES
        ('item-ok','ord-1','Stock Chair','PHYSICAL',2,'100.00','0.2000','40.00','200.00',true,false,NULL),
        ('item-no','ord-1','Bespoke Desk','PHYSICAL',1,'100.00','0.2000','20.00','100.00',false,false,'Cut to your measurements.'),
        ('item-maybe','ord-1','Big Cupboard','PHYSICAL',1,'100.00','0.2000','20.00','100.00',true,true,'Ask us - the van is not free.')
    `)
    // Everything dispatched, so there is something to send back and something to
    // report broken.
    await client.query(`INSERT INTO "shp_shipments" ("id","order_id") VALUES ('ship-1','ord-1')`)
    await client.query(`
      INSERT INTO "shp_shipment_items" ("shipment_id","order_item_id","quantity") VALUES
        ('ship-1','item-ok',2), ('ship-1','item-no',1), ('ship-1','item-maybe',1)
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

  it('refuses a return of a line the shop does not take back, and says which', async () => {
    const outcome = await requests.createOrderRequest({
      orderId: 'ord-1',
      memberId: null,
      type: 'RETURN',
      reason: 'NO_LONGER_NEEDED',
      items: [{ orderItemId: 'item-no', quantity: 1 }],
    })
    expect(outcome.ok).toBe(false)
    expect(!outcome.ok && outcome.error).toContain('Bespoke Desk')
  })

  it('takes a return of a discretionary line - asking is the whole point of it', async () => {
    const outcome = await requests.createOrderRequest({
      orderId: 'ord-1',
      memberId: null,
      type: 'RETURN',
      reason: 'NO_LONGER_NEEDED',
      items: [{ orderItemId: 'item-maybe', quantity: 1 }],
    })
    expect(outcome.ok).toBe(true)
  })

  it('flags that return as the shop’s to refuse, without opening the order', async () => {
    const { requests: rows } = await requests.listRequestsForAdmin({ status: 'PENDING' })
    expect(rows).toHaveLength(1)
    expect(rows[0]!.discretionary).toBe(true)
    expect(rows[0]!.orderNumber).toBe('DW000200')
  })

  it('refuses a second cancel or return while one is open', async () => {
    const outcome = await requests.createOrderRequest({
      orderId: 'ord-1',
      memberId: null,
      type: 'RETURN',
      reason: 'NO_LONGER_NEEDED',
      items: [{ orderItemId: 'item-ok', quantity: 1 }],
    })
    expect(outcome.ok).toBe(false)
    expect(!outcome.ok && outcome.status).toBe(409)
  })

  // The reason the one-open index was split rather than widened: a second parcel
  // arriving broken must not have to wait for a return to be decided.
  it('takes a damage report while that return is still open, photographs and all', async () => {
    const outcome = await requests.createOrderRequest({
      orderId: 'ord-1',
      memberId: null,
      type: 'DAMAGE',
      reason: 'ARRIVED_DAMAGED',
      items: [{ orderItemId: 'item-no', quantity: 1 }],
      photos: [
        { mediaId: 'media-1', url: 'https://example.test/a.jpg' },
        { mediaId: null, url: 'https://example.test/b.jpg' },
      ],
    })
    expect(outcome.ok).toBe(true)
    expect(outcome.ok && outcome.request.photos.map((p) => p.url)).toEqual([
      'https://example.test/a.jpg',
      'https://example.test/b.jpg',
    ])
  })

  it('reads those photographs back on the order', async () => {
    const all = await requests.listRequestsForOrder('ord-1')
    const damage = all.find((r) => r.type === 'DAMAGE')
    expect(damage?.photos).toHaveLength(2)
    expect(damage?.items).toHaveLength(1)
    // And the return alongside it carries none, rather than borrowing them.
    expect(all.find((r) => r.type === 'RETURN')?.photos).toEqual([])
  })

  it('refuses a second damage report while the first is open', async () => {
    const outcome = await requests.createOrderRequest({
      orderId: 'ord-1',
      memberId: null,
      type: 'DAMAGE',
      reason: 'FAULTY',
      items: [{ orderItemId: 'item-ok', quantity: 1 }],
    })
    expect(outcome.ok).toBe(false)
    expect(!outcome.ok && outcome.status).toBe(409)
  })

  it('does not count the open cancel/return as the damage report, or the other way about', async () => {
    const open = await requests.getOpenRequestForOrder('ord-1')
    expect(open?.type).toBe('RETURN')
  })

  it('records a return charge on an approval, as money rather than as text', async () => {
    const open = await requests.getOpenRequestForOrder('ord-1')
    const decided = await requests.decideRequest({
      requestId: open!.id,
      status: 'APPROVED',
      adminNote: 'Collection is forty pounds.',
      returnCharge: 40,
      decidedBy: 'user-1',
    })
    // A decimal string, as every money column in this module is - the exact
    // rendering is Prisma's ("40", not "40.00"), so the figure is what is
    // asserted rather than the spelling of it.
    expect(Number(decided?.returnCharge)).toBe(40)
    const [row] = (await client.query(`SELECT "return_charge"::text AS c FROM "shp_order_requests" WHERE "id" = $1`, [open!.id])).rows
    expect(row.c).toBe('40.00')
  })

  it('will not hang a return charge on a damage report - we do not charge for our own mistakes', async () => {
    const damage = (await requests.listRequestsForOrder('ord-1')).find((r) => r.type === 'DAMAGE')
    const decided = await requests.decideRequest({
      requestId: damage!.id,
      status: 'APPROVED',
      returnCharge: 40,
      decidedBy: 'user-1',
    })
    expect(decided?.returnCharge).toBeNull()
  })

  // A damage report names lines without spending them. Counting it would refuse
  // the return of the very item the customer has just told us about. Run after
  // the approval above, so the only thing that could refuse it is the damage
  // report - the open return would have refused it for its own reasons.
  it('leaves a line reported damaged still returnable', async () => {
    const outcome = await requests.createOrderRequest({
      orderId: 'ord-1',
      memberId: null,
      type: 'RETURN',
      reason: 'NO_LONGER_NEEDED',
      items: [{ orderItemId: 'item-ok', quantity: 2 }],
    })
    expect(outcome.ok).toBe(true)
  })

  it('refuses to send back more than arrived', async () => {
    const open = await requests.getOpenRequestForOrder('ord-1')
    await requests.decideRequest({ requestId: open!.id, status: 'DECLINED', decidedBy: 'user-1' })
    const outcome = await requests.createOrderRequest({
      orderId: 'ord-1',
      memberId: null,
      type: 'RETURN',
      reason: 'NO_LONGER_NEEDED',
      items: [{ orderItemId: 'item-ok', quantity: 3 }],
    })
    expect(outcome.ok).toBe(false)
    expect(!outcome.ok && outcome.error).toContain('at most 2')
  })

  it('flags a cancellation as discretionary from the whole order, which names no lines', async () => {
    await client.query(`
      INSERT INTO "shp_orders" (
        "id","order_number","customer_email","customer_name","shipping_address",
        "subtotal","total","tax_mode","payment_method"
      ) VALUES ('ord-2','DW000201','buyer@example.com','A Buyer','{"postcode":"E1 1AA"}','100.00','120.00','EXCLUSIVE','BANK_TRANSFER')
    `)
    await client.query(`
      INSERT INTO "shp_order_items" (
        "id","order_id","product_name","product_type","quantity","unit_price","tax_rate","tax_amount","total",
        "returnable","returns_discretionary"
      ) VALUES ('item-2','ord-2','Big Cupboard','PHYSICAL',1,'100.00','0.2000','20.00','100.00',true,true)
    `)
    const outcome = await requests.createOrderRequest({
      orderId: 'ord-2',
      memberId: null,
      type: 'CANCEL',
      reason: 'CHANGED_MIND',
    })
    expect(outcome.ok).toBe(true)

    const { requests: rows } = await requests.listRequestsForAdmin({ status: 'PENDING' })
    const cancel = rows.find((r) => r.orderNumber === 'DW000201')
    expect(cancel?.discretionary).toBe(true)
    expect(cancel?.items).toEqual([])
  })
})
