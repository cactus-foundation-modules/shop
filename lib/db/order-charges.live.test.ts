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

// Redelivery charges on an order (lib/order-charges.ts), against a real Postgres.
//
// Every state change on a charge is one conditional UPDATE, and the whole
// feature leans on those being exactly-once: a card payment and a cancellation
// racing for the same fee, or the customer's confirm and the provider's webhook
// arriving together. That is raw SQL, which no typecheck, lint or build ever
// runs - so it is run here. The last case goes the whole way through a
// cancellation that keeps the fee back, refund and all, on a bank-transfer
// order whose refund is recorded rather than sent.
//
// Gated like the other live suites: it needs the OVH server, makes cactus_rt_*
// databases, and drops them afterwards.
const ENABLED = process.env.RUN_LEDGER_GUARDS === '1' || process.env.RUN_BACKUP_ROUNDTRIP === '1'
if (ENABLED) {
  try {
    ;(process as unknown as { loadEnvFile: (path: string) => void }).loadEnvFile('.env')
  } catch {
    // No .env - testServerFromEnv below fails the suite loudly rather than here.
  }
}
const suite = ENABLED ? describe : describe.skip

suite('order charges, against a real database', () => {
  let server: TestServer
  let role: TestRole
  let client: Client
  const databaseName = `cactus_rt_shopchg_${process.pid}`
  const roleName = `cactus_rt_role_shopchg_${process.pid}`

  let charges: typeof import('./order-charges')
  let service: typeof import('../order-charges')

  async function orderRow(id: string): Promise<{ status: string; payment_status: string }> {
    const result = await client.query('SELECT "status", "payment_status" FROM "shp_orders" WHERE "id" = $1', [id])
    return result.rows[0]
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

    process.env.DATABASE_URL = uri
    charges = await import('./order-charges')
    service = await import('../order-charges')

    // One paid, dispatched order per case, so no case can see another's
    // charges. Prices before VAT, free delivery: £149.95 + £29.99 = £179.94.
    for (const id of ['ord-a', 'ord-b', 'ord-c', 'ord-d', 'ord-e', 'ord-f']) {
      await client.query(
        `INSERT INTO "shp_orders" (
          "id","order_number","customer_email","customer_name","shipping_address",
          "subtotal","tax_amount","total","tax_mode","payment_method","payment_status","status","paid_at"
        ) VALUES ($1,$2,'buyer@example.com','A Buyer','{"postcode":"E1 1AA","line1":"1 Road","city":"London","country":"GB"}',
          '149.95','29.99','179.94','EXCLUSIVE','BANK_TRANSFER','PAID','SHIPPED',CURRENT_TIMESTAMP)`,
        [id, `DW9${id.slice(-1)}`],
      )
      await client.query(
        `INSERT INTO "shp_order_items" (
          "id","order_id","product_name","product_type","quantity","unit_price","tax_rate","tax_amount","total"
        ) VALUES ($1,$2,'Desk','PHYSICAL',1,'149.95','0.2000','29.99','149.95')`,
        [`item-${id}`, id],
      )
    }
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

  const base = {
    reason: 'Redelivery fee', note: null, netAmount: 39, taxRate: 20, taxAmount: 7.8, total: 46.8,
    cancellationNet: 0, cancellationTax: 0, cancellationTotal: 0, cancellationNote: null, currency: 'GBP', holdOrder: true, heldFromStatus: 'SHIPPED' as const, createdBy: 'user-1',
  }

  it('stores a charge and reads its money back as it was written', async () => {
    const charge = await charges.insertCharge({ ...base, orderId: 'ord-a' })
    expect(charge.status).toBe('PENDING')
    expect(charge.netAmount).toBe('39')
    expect(Number(charge.taxAmount)).toBe(7.8)
    expect(Number(charge.total)).toBe(46.8)
    expect(Number(charge.taxRate)).toBe(20)
    expect(charge.heldFromStatus).toBe('SHIPPED')

    const listed = await charges.listChargesForOrder('ord-a')
    expect(listed.map((c) => c.id)).toEqual([charge.id])
  })

  it('allows one charge waiting per order, in words', async () => {
    await expect(charges.insertCharge({ ...base, orderId: 'ord-a' })).rejects.toBeInstanceOf(charges.ChargeAlreadyPendingError)
  })

  it('settles a charge exactly once, whichever way', async () => {
    const [pending] = await charges.listChargesForOrder('ord-a')
    const paid = await charges.markChargePaid(pending!.id, { method: 'SQUARE', reference: 'pay_1', resolvedBy: null })
    expect(paid?.status).toBe('PAID')
    expect(paid?.paidAt).toBeInstanceOf(Date)
    // A second payment, a waiver and a cancellation all find it gone.
    expect(await charges.markChargePaid(pending!.id, { method: 'SQUARE', reference: 'pay_2', resolvedBy: null })).toBeNull()
    expect(await charges.markChargeWaived(pending!.id, 'user-1')).toBeNull()
    expect(await charges.claimChargeForCancellation(pending!.id, null)).toBeNull()
    // And, settled, another may now be raised.
    const next = await charges.insertCharge({ ...base, orderId: 'ord-a' })
    expect(next.status).toBe('PENDING')
  })

  it('hands a cancellation claim back only while no refund is recorded against it', async () => {
    const charge = await charges.insertCharge({ ...base, orderId: 'ord-b' })
    expect((await charges.claimChargeForCancellation(charge.id, null))?.status).toBe('KEPT')
    await charges.releaseKeptCharge(charge.id)
    expect((await charges.getChargeById(charge.id))?.status).toBe('PENDING')

    await charges.claimChargeForCancellation(charge.id, null)
    await charges.setChargeRefund(charge.id, 'refund-1')
    await charges.releaseKeptCharge(charge.id)
    const kept = await charges.getChargeById(charge.id)
    expect(kept?.status).toBe('KEPT')
    expect(kept?.refundId).toBe('refund-1')
  })

  it('takes an order off hold only while it is still on hold', async () => {
    await client.query(`UPDATE "shp_orders" SET "status" = 'ON_HOLD' WHERE "id" = 'ord-c'`)
    expect(await charges.restoreHeldOrderStatus('ord-c', 'SHIPPED')).toBe(true)
    expect((await orderRow('ord-c')).status).toBe('SHIPPED')
    // Moved on by hand since: left alone.
    await client.query(`UPDATE "shp_orders" SET "status" = 'COMPLETED' WHERE "id" = 'ord-c'`)
    expect(await charges.restoreHeldOrderStatus('ord-c', 'SHIPPED')).toBe(false)
    expect((await orderRow('ord-c')).status).toBe('COMPLETED')
  })

  it('raises, holds, and on cancelling refunds everything less the fee', async () => {
    const raised = await service.raiseOrderCharge({
      orderId: 'ord-d', note: null, netAmount: 39, cancellationNet: 0, cancellationNote: null, taxRate: 20,
      holdOrder: true, emailCustomer: false, userId: 'user-1',
    })
    expect(raised.ok).toBe(true)
    if (!raised.ok) return
    expect(Number(raised.charge.total)).toBe(46.8)
    expect((await orderRow('ord-d')).status).toBe('ON_HOLD')

    const cancelled = await service.cancelOrderKeepingCharge(raised.charge.id, { kind: 'customer' })
    expect(cancelled).toMatchObject({ ok: true, refunded: 133.14 })
    if (!cancelled.ok) return
    expect(cancelled.charge.status).toBe('KEPT')
    expect(cancelled.charge.refundId).toBeTruthy()

    const order = await orderRow('ord-d')
    expect(order.status).toBe('CANCELLED')
    expect(order.payment_status).toBe('PARTIALLY_REFUNDED')

    const refunds = await client.query('SELECT "amount", "status", "created_by" FROM "shp_refunds" WHERE "order_id" = $1', ['ord-d'])
    expect(refunds.rows).toHaveLength(1)
    expect(Number(refunds.rows[0].amount)).toBe(133.14)
    expect(refunds.rows[0].status).toBe('COMPLETED')
    expect(refunds.rows[0].created_by).toBe('customer')
    const items = await client.query('SELECT "refunded_qty" FROM "shp_order_items" WHERE "order_id" = $1', ['ord-d'])
    expect(items.rows[0].refunded_qty).toBe(1)

    // And a second go finds nothing left to do.
    const again = await service.cancelOrderKeepingCharge(raised.charge.id, { kind: 'customer' })
    expect(again.ok).toBe(false)
  })

  it('changes the note and the cancellation charge where the charge stands', async () => {
    const charge = await charges.insertCharge({ ...base, orderId: 'ord-e' })
    const changed = await charges.changePendingCharge(
      charge.id,
      { note: 'Tuesday', netAmount: 39, taxRate: 20, taxAmount: 7.8, total: 46.8, cancellationNet: 10, cancellationTax: 2, cancellationTotal: 12, cancellationNote: 'Supplier admin, at cost.' },
      'user-2',
    )
    expect(changed?.replaced).toBe(false)
    expect(changed?.charge.id).toBe(charge.id)
    expect(changed?.charge.note).toBe('Tuesday')
    expect(Number(changed?.charge.cancellationTotal)).toBe(12)
    expect(changed?.charge.cancellationNote).toBe('Supplier admin, at cost.')
    expect(changed?.charge.status).toBe('PENDING')
    expect(await charges.latestCancellationNote()).toBe('Supplier admin, at cost.')
  })

  it('replaces the charge when the amount to pay moves, and an old payment cannot settle the new one', async () => {
    const [before] = (await charges.listChargesForOrder('ord-e')).filter((c) => c.status === 'PENDING')
    const changed = await charges.changePendingCharge(
      before!.id,
      { note: 'Tuesday', netAmount: 40, taxRate: 20, taxAmount: 8, total: 48, cancellationNet: 10, cancellationTax: 2, cancellationTotal: 12, cancellationNote: 'Supplier admin, at cost.' },
      'user-2',
    )
    expect(changed?.replaced).toBe(true)
    expect(changed?.charge.id).not.toBe(before!.id)
    expect(Number(changed?.charge.total)).toBe(48)
    expect(changed?.charge.heldFromStatus).toBe('SHIPPED')
    expect(changed?.charge.holdOrder).toBe(true)
    expect((await charges.getChargeById(before!.id))?.status).toBe('REPLACED')

    // A card payment started against the old figure lands on the old id: it
    // settles nothing, and says so on the timeline.
    expect(await service.settleOrderChargePayment(before!.id, { method: 'SQUARE', providerReference: 'pay_old' })).toBe(false)
    expect((await charges.getChargeById(changed!.charge.id))?.status).toBe('PENDING')
    const notes = await client.query(`SELECT "content" FROM "shp_order_notes" WHERE "order_id" = 'ord-e'`)
    expect(notes.rows.some((row: { content: string }) => row.content.includes('OLD amount') && row.content.includes('pay_old'))).toBe(true)

    // A replaced charge is no longer changeable, and still one pending per order.
    expect(await charges.changePendingCharge(before!.id, { ...base, note: null }, 'user-2')).toBeNull()
    expect((await charges.listChargesForOrder('ord-e')).filter((c) => c.status === 'PENDING')).toHaveLength(1)
  })

  it('on cancelling keeps the redelivery fee and the cancellation charge both', async () => {
    const raised = await service.raiseOrderCharge({
      orderId: 'ord-f', note: null, netAmount: 30, cancellationNet: 0, cancellationNote: null, taxRate: 20,
      holdOrder: true, emailCustomer: false, userId: 'user-1',
    })
    expect(raised.ok).toBe(true)
    if (!raised.ok) return

    // Owner puts it right afterwards, without emailing: £39 + VAT fee, £10 +
    // VAT to cancel.
    const changed = await service.changeOrderCharge(raised.charge.id, {
      note: null, netAmount: 39, cancellationNet: 10, cancellationNote: 'Supplier admin, at cost.', taxRate: 20, emailCustomer: false, userId: 'user-1',
    })
    expect(changed.ok).toBe(true)
    if (!changed.ok) return
    expect(Number(changed.charge.total)).toBe(46.8)
    expect(Number(changed.charge.cancellationTotal)).toBe(12)
    expect((await orderRow('ord-f')).status).toBe('ON_HOLD')

    const cancelled = await service.cancelOrderKeepingCharge(changed.charge.id, { kind: 'staff', userId: 'user-1' })
    // £179.94 less £46.80 less £12.00.
    expect(cancelled).toMatchObject({ ok: true, refunded: 121.14 })
    const refunds = await client.query('SELECT "amount" FROM "shp_refunds" WHERE "order_id" = $1', ['ord-f'])
    expect(Number(refunds.rows[0].amount)).toBe(121.14)
    expect((await orderRow('ord-f')).status).toBe('CANCELLED')
  })
})
