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

// Replacement parts, against a real Postgres.
//
// Every statement migration 052 brought with it is raw SQL, and raw SQL is the
// one thing `tsc`, `eslint` and the module build gate have nothing whatever to
// say about. Three of them are exactly the sort that typecheck perfectly and
// then fall over on the first real request:
//
//   - the numbering read, which uses substring(... FROM n) and a LIKE with an
//     ESCAPE clause to pick the highest -R suffix already in use,
//   - the COUNT(*) FILTER (WHERE kind = 'SALE') that keeps a free part out of
//     "orders this month" while leaving the money alone,
//   - the self-referencing foreign keys, which a database will accept in DDL
//     and then refuse the first row that breaks them.
//
// And the thing underneath them is whether a customer can find the part that
// was sent to put their order right, which is the wrong thing to discover in
// production.
//
// Gated exactly as the cancel/return suite next door is, and the databases it
// makes are cactus_rt_* and dropped afterwards. Nothing else on that server is
// ever named, opened or altered.
const ENABLED = process.env.RUN_LEDGER_GUARDS === '1' || process.env.RUN_BACKUP_ROUNDTRIP === '1'
if (ENABLED) {
  try {
    ;(process as unknown as { loadEnvFile: (path: string) => void }).loadEnvFile('.env')
  } catch {
    // No .env - testServerFromEnv below fails the suite loudly rather than here.
  }
}
const suite = ENABLED ? describe : describe.skip

suite('replacement parts, against a real database', () => {
  let server: TestServer
  let role: TestRole
  let client: Client
  const databaseName = `cactus_rt_shoprep_${process.pid}`
  const roleName = `cactus_rt_role_shoprep_${process.pid}`

  // Imported after DATABASE_URL is set, because lib/db/prisma reads it when the
  // client is built.
  let orders: typeof import('./orders')
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

    process.env.DATABASE_URL = uri
    orders = await import('./orders')
    shipments = await import('./shipments')

    await client.query(`
      INSERT INTO "shp_orders" (
        "id","order_number","customer_email","customer_name","shipping_address",
        "subtotal","total","tax_mode","payment_method","payment_status","paid_at"
      ) VALUES ('ord-1','DW000182','buyer@example.com','A Buyer','{"postcode":"E1 1AA"}','300.00','360.00','EXCLUSIVE','BANK_TRANSFER','PAID',NOW())
    `)
    await client.query(`
      INSERT INTO "shp_order_items" (
        "id","order_id","product_name","product_type","quantity","unit_price","tax_rate","tax_amount","total"
      ) VALUES ('item-chair','ord-1','Stock Chair','PHYSICAL',2,'100.00','0.2000','40.00','200.00')
    `)
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

  it('starts the numbering at -R1 and walks up from the highest already used', async () => {
    expect(await orders.nextReplacementNumber('DW000182')).toBe('DW000182-R1')

    await orders.createPendingOrder({
      orderNumber: 'DW000182-R1',
      kind: 'REPLACEMENT',
      parentOrderId: 'ord-1',
      status: 'PROCESSING',
      paymentStatus: 'PAID',
      paidAt: new Date(),
      customerEmail: 'buyer@example.com',
      customerName: 'A Buyer',
      shippingAddress: { firstName: 'A', lastName: 'Buyer', line1: '', city: '', postcode: 'E1 1AA', country: 'GB' },
      subtotal: 0, discountAmount: 0, shippingAmount: 0, taxAmount: 0, total: 0,
      taxMode: 'EXCLUSIVE', currency: 'GBP', paymentMethod: 'NONE',
      items: [{
        productId: null, productName: 'Gas lift', productSku: null, productType: 'PHYSICAL',
        quantity: 1, unitPrice: 0, taxRate: 0, taxAmount: 0, total: 0,
        isPreOrder: false, preOrderDispatchDate: null, replacesOrderItemId: 'item-chair',
      }],
    })

    expect(await orders.nextReplacementNumber('DW000182')).toBe('DW000182-R2')
  })

  it('counts a replacement against its parent, and hands the line back', async () => {
    const replacements = await orders.listReplacementOrdersForParent('ord-1')
    expect(replacements.map((r) => r.orderNumber)).toEqual(['DW000182-R1'])
    expect(replacements[0]?.kind).toBe('REPLACEMENT')
    expect(replacements[0]?.parentOrderId).toBe('ord-1')

    const items = await orders.getOrderItems(replacements[0]!.id)
    expect(items[0]?.productName).toBe('Gas lift')
    // The whole point of the column: the part names the line it is putting
    // right, because it is never the thing that was bought.
    expect(items[0]?.replacesOrderItemId).toBe('item-chair')
  })

  it('leaves a free replacement out of the order counts and out of the money', async () => {
    const overview = await orders.getOrdersOverview()
    // One sale, one replacement, and the count says one.
    expect(overview.paidOrders30d).toBe(1)
    // The money is untouched by the filter, and the free part adds nothing to it.
    expect(Number(overview.revenue30d)).toBe(360)

    const summary = await orders.getCustomerSummary('buyer@example.com')
    expect(summary.orderCount).toBe(1)
    expect(summary.paidOrderCount).toBe(1)
    expect(Number(summary.totalSpent)).toBe(360)
  })

  it('counts a CHARGED replacement as money, because that is what it is', async () => {
    await orders.createPendingOrder({
      orderNumber: 'DW000182-R2',
      kind: 'REPLACEMENT',
      parentOrderId: 'ord-1',
      status: 'PROCESSING',
      paymentStatus: 'PAID',
      paidAt: new Date(),
      customerEmail: 'buyer@example.com',
      customerName: 'A Buyer',
      shippingAddress: { firstName: 'A', lastName: 'Buyer', line1: '', city: '', postcode: 'E1 1AA', country: 'GB' },
      subtotal: 40, discountAmount: 0, shippingAmount: 0, taxAmount: 8, total: 48,
      taxMode: 'EXCLUSIVE', currency: 'GBP', paymentMethod: 'BANK_TRANSFER',
      items: [{
        productId: null, productName: 'Castor set', productSku: null, productType: 'PHYSICAL',
        quantity: 1, unitPrice: 40, taxRate: 0.2, taxAmount: 8, total: 40,
        isPreOrder: false, preOrderDispatchDate: null, replacesOrderItemId: 'item-chair',
      }],
    })

    const summary = await orders.getCustomerSummary('buyer@example.com')
    // Still one order placed - they bought one thing.
    expect(summary.orderCount).toBe(1)
    // And £48 more spent with this shop, because they paid it.
    expect(Number(summary.totalSpent)).toBe(408)
  })

  // The completion sweep is what closes an order once the courier says every
  // parcel arrived, and it is the same query for both kinds. Asserted rather
  // than assumed: a replacement that never reached it would sit in Processing
  // for ever with the part on the customer's doormat, and nothing anywhere
  // would look wrong.
  it('sweeps a delivered replacement up for completion, exactly as it would a sale', async () => {
    const [replacement] = await orders.listReplacementOrdersForParent('ord-1')
    expect(replacement).toBeDefined()

    // Nothing dispatched yet, so neither kind is anywhere near completion.
    expect(await shipments.allShipmentsDelivered(replacement!.id)).toBe(false)
    expect(await orders.listReplacementOrdersForParent('ord-1')).toHaveLength(2)

    const items = await orders.getOrderItems(replacement!.id)
    await client.query(
      `INSERT INTO "shp_shipments" ("id","order_id","tracking_url") VALUES ('ship-rep',$1,'https://example.test/track')`,
      [replacement!.id],
    )
    await client.query(
      `INSERT INTO "shp_shipment_items" ("shipment_id","order_item_id","quantity") VALUES ('ship-rep',$1,1)`,
      [items[0]!.id],
    )

    // Out, not yet arrived: the poller would look at it, and the sweep leaves
    // it alone.
    expect((await shipments.listShipmentsForTrackingPoll(50)).map((s) => s.id)).toContain('ship-rep')
    expect(await shipments.allShipmentsDelivered(replacement!.id)).toBe(false)
    expect(await shipments.listOrdersAwaitingCompletion(50)).not.toContain(replacement!.id)

    // The courier says it landed.
    await client.query(`UPDATE "shp_shipments" SET "delivered_at" = NOW(), "signed_by" = 'BECKLEY' WHERE "id" = 'ship-rep'`)

    expect(await shipments.allShipmentsDelivered(replacement!.id)).toBe(true)
    const summary = await shipments.getOrderDispatchSummary(replacement!.id)
    expect(summary.fullyDispatched).toBe(true)
    // Both halves of the cron's test met, so it is picked up and completed.
    expect(await shipments.listOrdersAwaitingCompletion(50)).toContain(replacement!.id)
  })

  // The tracking-added claim. Raw SQL, and the thing it guards is a customer
  // being emailed the same tracking number twice - or, worse, two admins saving
  // the same parcel together and both believing they are the one sending it.
  it('lets exactly one caller claim the tracking message, once, per parcel', async () => {
    const [replacement] = await orders.listReplacementOrdersForParent('ord-1')
    expect(replacement).toBeDefined()

    // First claim wins.
    expect(await shipments.claimTrackingNotification('ship-rep', replacement!.id)).toBe(true)
    // Second does not, however many times it is asked.
    expect(await shipments.claimTrackingNotification('ship-rep', replacement!.id)).toBe(false)

    const after = (await shipments.getShipmentsForOrder(replacement!.id)).find((s) => s.id === 'ship-rep')
    expect(after?.trackingNotifiedAt).toBeInstanceOf(Date)

    // And it is scoped to the order, so a parcel id from elsewhere cannot be
    // claimed through an order the caller happens to be allowed to see.
    await client.query(`UPDATE "shp_shipments" SET "tracking_notified_at" = NULL WHERE "id" = 'ship-rep'`)
    expect(await shipments.claimTrackingNotification('ship-rep', 'ord-1')).toBe(false)
  })

  it('refuses a replacement pointed at an order that does not exist', async () => {
    await expect(orders.createPendingOrder({
      orderNumber: 'DW000999-R1',
      kind: 'REPLACEMENT',
      parentOrderId: 'no-such-order',
      customerEmail: 'buyer@example.com',
      customerName: 'A Buyer',
      shippingAddress: { firstName: 'A', lastName: 'Buyer', line1: '', city: '', postcode: 'E1 1AA', country: 'GB' },
      subtotal: 0, discountAmount: 0, shippingAmount: 0, taxAmount: 0, total: 0,
      taxMode: 'EXCLUSIVE', currency: 'GBP', paymentMethod: 'NONE',
      items: [],
    })).rejects.toThrow()
  })

  it('refuses a kind it has never heard of', async () => {
    await expect(
      client.query(`UPDATE "shp_orders" SET "kind" = 'GIFT' WHERE "id" = 'ord-1'`),
    ).rejects.toThrow(/kind_check/)
  })

  it('survives an order number prefix with a LIKE wildcard in it', async () => {
    // The prefix is an owner-typed setting, so it can hold a %. Unescaped, the
    // pattern "100%-R%" reads as "100, anything, -R, anything" - and this row
    // matches it, which would hand the next part the number -R8.
    await client.query(`
      INSERT INTO "shp_orders" (
        "id","order_number","customer_email","customer_name","shipping_address",
        "subtotal","total","tax_mode","payment_method"
      ) VALUES ('ord-pc','100ABC-R7','buyer@example.com','A Buyer','{"postcode":"E1 1AA"}','0','0','EXCLUSIVE','NONE')
    `)
    expect(await orders.nextReplacementNumber('100%')).toBe('100%-R1')
  })
})
