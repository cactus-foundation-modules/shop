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

// Products made up of other products (migration 075), against a real Postgres.
//
// The whole feature is triggers and raw SQL - the kit's stock follows its
// scarcest part, an attempt to set it by hand is overridden, a sale takes the
// parts off - and raw SQL is the one thing tsc, eslint and the build gate have
// nothing to say about. So it is run here.
//
// Gated like the suites beside it; the database it makes is a cactus_rt_* one,
// dropped afterwards, and nothing else on that server is ever named.

vi.mock('next/headers', () => ({ headers: async () => new Headers(), cookies: async () => ({ get: () => undefined }) }))

const ENABLED = process.env.RUN_LEDGER_GUARDS === '1' || process.env.RUN_BACKUP_ROUNDTRIP === '1'
if (ENABLED) {
  try {
    ;(process as unknown as { loadEnvFile: (path: string) => void }).loadEnvFile('.env')
  } catch {
    // No .env - testServerFromEnv below fails the suite loudly rather than here.
  }
}
const suite = ENABLED ? describe : describe.skip

suite('kits, against a real database', () => {
  let server: TestServer
  let role: TestRole
  let client: Client
  const databaseName = `cactus_rt_kits_${process.pid}`
  const roleName = `cactus_rt_role_kits_${process.pid}`

  let q: (sql: string, params?: unknown[]) => Promise<Record<string, unknown>[]>
  const stock = async (id: string) => {
    const row = (await q(`SELECT track_inventory, stock_count FROM shp_products WHERE id=$1`, [id]))[0]!
    return { tracked: row.track_inventory as boolean, count: row.stock_count as number | null }
  }
  const product = (id: string, count: number | null, tracked = true) =>
    q(`INSERT INTO "shp_products" ("id","name","slug","type","price","status","track_inventory","stock_count","out_of_stock_behaviour")
       VALUES ($1,$2,$3,'PHYSICAL','10.00','ACTIVE',$4,$5,'BLOCK')`, [id, `Name ${id}`, `slug-${id}`, tracked, count])

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
    // The migration is meant to be run again on an install that already has it.
    await client.query(readFileSync(join(dir, '075_product_components.sql'), 'utf8'))
    q = async (sql, params = []) => (await client.query(sql, params)).rows
    process.env.DATABASE_URL = uri
  }, 300_000)

  afterAll(async () => {
    await import('@/lib/db/prisma').then((m) => m.prisma.$disconnect()).catch(() => undefined)
    await client?.end().catch(() => undefined)
    if (server) {
      await dropTestDatabase(server, databaseName).catch(() => undefined)
      await dropTestRole(server, roleName).catch(() => undefined)
    }
  }, 120_000)

  it('follows its scarcest part, and comes back when that part does', async () => {
    await product('seat', 10)
    await product('back', 3)
    await product('base', 9)
    await product('kit-chair', 99)
    await q(`INSERT INTO shp_product_components (product_id, component_product_id, quantity) VALUES
             ('kit-chair','seat',1), ('kit-chair','back',1), ('kit-chair','base',2)`)
    // min(10/1, 3/1, floor(9/2)=4) = 3: the 99 typed in is not the kit's to say.
    expect(await stock('kit-chair')).toEqual({ tracked: true, count: 3 })

    await q(`UPDATE shp_products SET stock_count = 0 WHERE id='back'`)
    expect(await stock('kit-chair')).toEqual({ tracked: true, count: 0 })

    await q(`UPDATE shp_products SET stock_count = 40 WHERE id='back'`)
    expect(await stock('kit-chair')).toEqual({ tracked: true, count: 4 })
  })

  it('overrides a write to the kit\'s own count', async () => {
    await q(`UPDATE shp_products SET stock_count = 500, track_inventory = false WHERE id='kit-chair'`)
    expect(await stock('kit-chair')).toEqual({ tracked: true, count: 4 })
    await q(`UPDATE shp_products SET stock_count = GREATEST(COALESCE(stock_count,0) - 3, 0) WHERE id='kit-chair'`)
    expect(await stock('kit-chair')).toEqual({ tracked: true, count: 4 })
  })

  it('ignores a part that is not counted, and does not count a kit of such parts', async () => {
    await product('free-gift', null, false)
    await product('kit-gift', 7)
    await q(`INSERT INTO shp_product_components (product_id, component_product_id, quantity) VALUES ('kit-gift','free-gift',1)`)
    expect(await stock('kit-gift')).toEqual({ tracked: false, count: null })

    await q(`INSERT INTO shp_product_components (product_id, component_product_id, quantity) VALUES ('kit-gift','back',2)`)
    expect(await stock('kit-gift')).toEqual({ tracked: true, count: 20 })
    await q(`DELETE FROM shp_product_components WHERE product_id='kit-gift' AND component_product_id='back'`)
    expect(await stock('kit-gift')).toEqual({ tracked: false, count: null })
  })

  it('refuses nesting in both directions', async () => {
    await product('kit-outer', 0)
    await expect(q(`INSERT INTO shp_product_components (product_id, component_product_id, quantity) VALUES ('kit-outer','kit-chair',1)`))
      .rejects.toThrow(/cannot be a part of another kit/)
    await expect(q(`INSERT INTO shp_product_components (product_id, component_product_id, quantity) VALUES ('seat','free-gift',1)`))
      .rejects.toThrow(/cannot be made into a kit/)
    await expect(q(`INSERT INTO shp_product_components (product_id, component_product_id, quantity) VALUES ('kit-outer','kit-outer',1)`))
      .rejects.toThrow()
    await expect(q(`INSERT INTO shp_product_components (product_id, component_product_id, quantity) VALUES ('kit-outer','seat',0)`))
      .rejects.toThrow()
  })

  it('will not delete a part from under a kit, but deletes a kit with its own parts in one go', async () => {
    await expect(q(`DELETE FROM shp_products WHERE id='seat'`)).rejects.toThrow(/foreign key/)
    await product('tmp-part', 1)
    await product('tmp-kit', 0)
    await q(`INSERT INTO shp_product_components (product_id, component_product_id, quantity) VALUES ('tmp-kit','tmp-part',1)`)
    await q(`DELETE FROM shp_products WHERE id IN ('tmp-part','tmp-kit')`)
    expect((await q(`SELECT 1 FROM shp_products WHERE id IN ('tmp-part','tmp-kit')`)).length).toBe(0)
  })

  it('setProductComponents replaces the list and says why it refuses', async () => {
    const { setProductComponents, getProductComponents } = await import('@/modules/shop/lib/db/product-components')
    await product('kit-set', 0)
    const ok = await setProductComponents('kit-set', [{ productId: 'seat', quantity: 2 }, { productId: 'back', quantity: 1 }])
    expect(ok.ok).toBe(true)
    expect((await getProductComponents('kit-set')).map((p) => [p.componentProductId, p.quantity])).toEqual([['seat', 2], ['back', 1]])
    expect(await stock('kit-set')).toEqual({ tracked: true, count: 5 })

    const nested = await setProductComponents('kit-set', [{ productId: 'kit-chair', quantity: 1 }])
    expect(nested).toMatchObject({ ok: false })
    const selfRef = await setProductComponents('kit-set', [{ productId: 'kit-set', quantity: 1 }])
    expect(selfRef).toMatchObject({ ok: false })
    const asPart = await setProductComponents('seat', [{ productId: 'base', quantity: 1 }])
    expect(asPart).toMatchObject({ ok: false, error: expect.stringContaining('is a part of') })
    const missing = await setProductComponents('kit-set', [{ productId: 'nope', quantity: 1 }])
    expect(missing).toMatchObject({ ok: false })
    // The list survived every refusal.
    expect((await getProductComponents('kit-set')).length).toBe(2)

    expect((await setProductComponents('kit-set', [])).ok).toBe(true)
    expect((await getProductComponents('kit-set')).length).toBe(0)
  })

  it('a sale takes the parts off, and a refund puts the undispatched ones back', async () => {
    const orders = await import('@/modules/shop/lib/db/orders')
    const { takeStockForPaidOrder, restockRefundedUnits } = await import('@/modules/shop/lib/db/order-stock')
    await q(`UPDATE shp_products SET stock_count = 10 WHERE id IN ('seat','back')`)
    await q(`UPDATE shp_products SET stock_count = 20 WHERE id='base'`)
    expect(await stock('kit-chair')).toEqual({ tracked: true, count: 10 })

    const addr = { firstName: 'A', lastName: 'Buyer', line1: '1 Street', city: 'Town', postcode: 'E1 1AA', country: 'GB' }
    const created = await orders.createPendingOrder({
      orderNumber: 'DW000101', customerEmail: 'a@example.com', customerName: 'A Buyer', shippingAddress: addr,
      subtotal: 300, discountAmount: 0, shippingAmount: 0, taxAmount: 0, total: 300, taxMode: 'EXCLUSIVE', currency: 'GBP',
      paymentMethod: 'STRIPE',
      items: [{
        productId: 'kit-chair', productName: 'Kit chair', productSku: null, productType: 'PHYSICAL',
        quantity: 3, unitPrice: 100, taxRate: 0, taxAmount: 0, total: 300, isPreOrder: false, preOrderDispatchDate: null,
      }],
    } as Parameters<typeof orders.createPendingOrder>[0])
    const [line] = await orders.getOrderItems(created.id)
    expect(await takeStockForPaidOrder('DW000101', [line!.id])).toEqual([])

    expect(await stock('seat')).toEqual({ tracked: true, count: 7 })
    expect(await stock('back')).toEqual({ tracked: true, count: 7 })
    expect(await stock('base')).toEqual({ tracked: true, count: 14 })
    expect(await stock('kit-chair')).toEqual({ tracked: true, count: 7 })
    // Booked against the parts, under the order's number.
    expect((await q(`SELECT product_id FROM shp_stock_movements WHERE reference='DW000101' ORDER BY product_id`)).map((r) => r.product_id))
      .toEqual(['back', 'base', 'seat'])

    // One kit refunded: one of each part back, never the kit's own row.
    await q(`UPDATE shp_order_items SET refunded_qty = 1 WHERE id=$1`, [line!.id])
    await restockRefundedUnits(created.id, [{ orderItemId: line!.id, quantity: 1 }])
    expect(await stock('seat')).toEqual({ tracked: true, count: 8 })
    expect(await stock('base')).toEqual({ tracked: true, count: 16 })
    expect(await stock('kit-chair')).toEqual({ tracked: true, count: 8 })
  })

  it('the stock adjuster refuses a kit, and a delivery of a part moves the kit', async () => {
    const { adjustStockBatch } = await import('@/modules/shop/lib/stock')
    const [refused] = await adjustStockBatch([{ productId: 'kit-chair', delta: 5, reason: 'purchase-order.receipt' }])
    expect(refused).toMatchObject({ ok: false })
    expect(await stock('kit-chair')).toEqual({ tracked: true, count: 8 })

    const [moved] = await adjustStockBatch([{ productId: 'seat', delta: -6, reason: 'purchase-order.receipt' }])
    expect(moved).toMatchObject({ ok: true, before: 8, after: 2 })
    expect(await stock('kit-chair')).toEqual({ tracked: true, count: 2 })
  })
})
