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
    shipments = await import('./shipments')

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

  // The media library optimises and re-files a customer's photographs like any
  // other picture, and the address changes when it does. The order screen has to
  // show the picture where it is now, not where it was when the report came in.
  it('shows a photograph at its library item\'s current address once it has been optimised', async () => {
    await client.query(`
      INSERT INTO "Media" ("id","key","provider","url","mimeType","sizeBytes")
      VALUES ('media-1','media/orders/dw000200/issues/a.webp','B2','https://example.test/media/orders/dw000200/issues/a.webp','image/webp',100)
    `)
    const damage = (await requests.listRequestsForOrder('ord-1')).find((r) => r.type === 'DAMAGE')
    expect(damage?.photos.map((p) => p.url)).toEqual([
      'https://example.test/media/orders/dw000200/issues/a.webp',
      // No library item behind this one, so it keeps the address it was sent with.
      'https://example.test/b.jpg',
    ])
  })

  // And a second one on top of that. A report spends nothing - it names lines
  // without taking them off the order - so nothing double-counts when two are
  // open together, and the order of eight desks is opened one carton at a time.
  // Migration 053 dropped the index that used to refuse this.
  it('takes a second issue report while the first is still open', async () => {
    const outcome = await requests.createOrderRequest({
      orderId: 'ord-1',
      memberId: null,
      type: 'DAMAGE',
      reason: 'FAULTY',
      items: [{ orderItemId: 'item-ok', quantity: 1 }],
    })
    expect(outcome.ok).toBe(true)
    const open = (await requests.listRequestsForOrder('ord-1')).filter(
      (r) => r.type === 'DAMAGE' && r.status === 'PENDING',
    )
    expect(open).toHaveLength(2)
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
    // Named by its reason rather than taken as "the damage one": there are two
    // open on this order by now, and which of them this decides has to be the
    // one the assertion is about.
    const damage = (await requests.listRequestsForOrder('ord-1')).find(
      (r) => r.type === 'DAMAGE' && r.reason === 'ARRIVED_DAMAGED',
    )
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

  // Calling off PART of an order, which is three new pieces of raw SQL: the
  // FILTER aggregate that separates a cancellation already approved from one
  // merely asked for, the join that takes approved cancellations off the
  // dispatch figures, and the rewritten EXISTS behind the queue's "your call"
  // flag. None of the three is anything but a string to `tsc`, to `eslint` or
  // to the module build gate.
  describe('cancelling individual lines', () => {
    beforeAll(async () => {
      await client.query(`
        INSERT INTO "shp_orders" (
          "id","order_number","customer_email","customer_name","shipping_address",
          "subtotal","total","tax_mode","payment_method"
        ) VALUES ('ord-3','DW000202','buyer@example.com','A Buyer','{"postcode":"E1 1AA"}','700.00','840.00','EXCLUSIVE','BANK_TRANSFER')
      `)
      await client.query(`
        INSERT INTO "shp_order_items" (
          "id","order_id","product_name","product_type","quantity","unit_price","tax_rate","tax_amount","total",
          "returnable","returns_discretionary","non_returnable_note"
        ) VALUES
          ('item-3-ok','ord-3','Stock Chair','PHYSICAL',5,'100.00','0.2000','100.00','500.00',true,false,NULL),
          ('item-3-no','ord-3','Bespoke Desk','PHYSICAL',1,'100.00','0.2000','20.00','100.00',false,false,'Cut to your measurements.'),
          ('item-3-maybe','ord-3','Big Cupboard','PHYSICAL',1,'100.00','0.2000','20.00','100.00',true,true,NULL)
      `)
    }, 60_000)

    it('refuses to call off a line the shop cannot unmake, and says which', async () => {
      const outcome = await requests.createOrderRequest({
        orderId: 'ord-3',
        memberId: null,
        type: 'CANCEL',
        reason: 'CHANGED_MIND',
        items: [{ orderItemId: 'item-3-no', quantity: 1 }],
      })
      expect(outcome.ok).toBe(false)
      expect(!outcome.ok && outcome.error).toContain('Bespoke Desk')
    })

    it('refuses to call off more than is still sitting here', async () => {
      const outcome = await requests.createOrderRequest({
        orderId: 'ord-3',
        memberId: null,
        type: 'CANCEL',
        reason: 'CHANGED_MIND',
        items: [{ orderItemId: 'item-3-ok', quantity: 6 }],
      })
      expect(outcome.ok).toBe(false)
      expect(!outcome.ok && outcome.error).toContain('at most 5')
    })

    it('takes a cancellation of two of the five', async () => {
      const outcome = await requests.createOrderRequest({
        orderId: 'ord-3',
        memberId: null,
        type: 'CANCEL',
        reason: 'ORDERED_WRONG',
        items: [{ orderItemId: 'item-3-ok', quantity: 2 }],
      })
      expect(outcome.ok).toBe(true)
      expect(outcome.ok && outcome.request.items).toHaveLength(1)
      expect(outcome.ok && outcome.request.items[0]!.quantity).toBe(2)
    })

    // The flag used to be read off the type: a cancellation named no lines, so
    // it covered the lot. A part-cancellation names lines, and flagging it off a
    // discretionary line the customer never mentioned tells the owner their
    // hands are tied when they are not.
    it('does not flag that as the shop’s to refuse - it names a plain line', async () => {
      const { requests: rows } = await requests.listRequestsForAdmin({ status: 'PENDING' })
      const cancel = rows.find((r) => r.orderNumber === 'DW000202')
      expect(cancel?.discretionary).toBe(false)
      expect(cancel?.items).toHaveLength(1)
    })

    it('takes the approved units off what may still be dispatched', async () => {
      const open = await requests.getOpenRequestForOrder('ord-3')
      await requests.decideRequest({ requestId: open!.id, status: 'APPROVED', decidedBy: 'user-1' })

      const summary = await shipments.getOrderDispatchSummary('ord-3')
      const line = summary.lines.find((l) => l.orderItemId === 'item-3-ok')
      expect(line?.cancelledQty).toBe(2)
      expect(line?.outstandingQty).toBe(3)
    })

    // The failure this exists to stop: approved on a shop that settles by hand,
    // no money moved, nothing took the units off the dispatch screen, and all
    // five turned up.
    it('refuses to dispatch units that have been called off', async () => {
      const outcome = await shipments.createShipment({
        orderId: 'ord-3',
        items: [{ orderItemId: 'item-3-ok', quantity: 4 }],
      })
      expect(outcome.ok).toBe(false)
      expect(!outcome.ok && outcome.error).toContain('only 3')
    })

    it('still lets the rest of the line go out', async () => {
      const outcome = await shipments.createShipment({
        orderId: 'ord-3',
        items: [{ orderItemId: 'item-3-ok', quantity: 3 }],
      })
      expect(outcome.ok).toBe(true)
    })

    it('will not call off a line once it is in the van', async () => {
      const outcome = await requests.createOrderRequest({
        orderId: 'ord-3',
        memberId: null,
        type: 'CANCEL',
        reason: 'CHANGED_MIND',
        items: [{ orderItemId: 'item-3-ok', quantity: 1 }],
      })
      expect(outcome.ok).toBe(false)
      expect(!outcome.ok && outcome.error).toContain('return rather than a cancellation')
    })

    // Cancellations spend undispatched units and returns spend dispatched ones.
    // Netting one off the other refuses the return of goods the customer is
    // holding because they called off the part that had not been packed.
    it('leaves the dispatched units returnable despite the cancellation', async () => {
      const outcome = await requests.createOrderRequest({
        orderId: 'ord-3',
        memberId: null,
        type: 'RETURN',
        reason: 'NO_LONGER_NEEDED',
        items: [{ orderItemId: 'item-3-ok', quantity: 3 }],
      })
      expect(outcome.ok).toBe(true)
    })
  })
})
