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

// The failed-email retry's state (migration 076), against a real Postgres.
//
// Every statement in lib/db/order-email-retry.ts is raw SQL that no typecheck,
// lint or build runs - the leases, the database-clock arithmetic, the jsonb
// merge and filter. Each is run here, on notes reset between cases, and the
// migration a second time as an install that already has it would.
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

const EMAIL = { trigger: 'DELIVERY_SLOT_CONFIRMED', to: 'buyer@example.com', subject: 'Booked in', html: '<p>Hi</p>', text: 'Hi', shipmentId: 'shp-1', toldWindow: '2026-10-26 13:45-15:45' }

suite('failed-email retry state, against a real database', () => {
  let server: TestServer
  let role: TestRole
  let client: Client
  const databaseName = `cactus_rt_shopretry_${process.pid}`
  const roleName = `cactus_rt_role_shopretry_${process.pid}`

  let retry: typeof import('./order-email-retry')

  async function note(id: string) {
    return (await client.query(
      `SELECT *, EXTRACT(EPOCH FROM ("email_next_try_at" - CURRENT_TIMESTAMP::timestamp(3))) AS "next_in",
              EXTRACT(EPOCH FROM ("email_retry_until" - CURRENT_TIMESTAMP::timestamp(3))) AS "until_in"
         FROM "shp_order_notes" WHERE "id" = $1`,
      [id],
    )).rows[0]
  }

  async function freshNote(): Promise<string> {
    const id = await retry.insertFailedEmailNote('ord-1', 'Email not sent yet', EMAIL, { forMs: 300_000, firstGapMs: 10_000 })
    if (!id) throw new Error('no id')
    return id
  }

  async function makeDue(id: string) {
    await client.query(`UPDATE "shp_order_notes" SET "email_next_try_at" = CURRENT_TIMESTAMP - interval '1 second' WHERE "id" = $1`, [id])
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
    // 076 a second time, as an install that already has it would.
    await client.query(readFileSync(join(directory, '076_order_email_retry.sql'), 'utf8'))

    process.env.DATABASE_URL = uri
    retry = await import('./order-email-retry')

    for (const id of ['ord-1', 'ord-2']) {
      await client.query(
        `INSERT INTO "shp_orders" (
          "id","order_number","customer_email","customer_name","shipping_address",
          "subtotal","tax_amount","total","tax_mode","payment_method","payment_status","status","paid_at"
        ) VALUES ($1,$2,'buyer@example.com','A Buyer','{"postcode":"AB1 2DE","line1":"1 Road","city":"Exampletown","country":"GB"}',
          '100.00','20.00','120.00','EXCLUSIVE','BANK_TRANSFER','PAID','SHIPPED',CURRENT_TIMESTAMP)`,
        [id, `DW-${id}`],
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

  beforeEach(async () => {
    await client.query(`DELETE FROM "shp_order_notes"`)
  })

  it('a new failed note starts five minutes of trying, the first try ten seconds off', async () => {
    const row = await note(await freshNote())
    expect(row.failed_email).toMatchObject({ trigger: 'DELIVERY_SLOT_CONFIRMED', shipmentId: 'shp-1' })
    expect(Number(row.next_in)).toBeGreaterThan(5)
    expect(Number(row.next_in)).toBeLessThanOrEqual(10.5)
    expect(Number(row.until_in)).toBeGreaterThan(290)
    expect(row.email_tries).toBe(0)
    expect(row.email_settled_at).toBeNull()
  })

  it('a note with no retry has neither time', async () => {
    const id = await retry.insertFailedEmailNote('ord-1', 'Email not sent', EMAIL, null)
    const row = await note(id!)
    expect(row.email_next_try_at).toBeNull()
    expect(row.email_retry_until).toBeNull()
  })

  it('claims a due try exactly once, and never one not yet due', async () => {
    const id = await freshNote()
    expect(await retry.claimDueRetries(75_000, 5)).toEqual([])
    await makeDue(id)
    const claimed = await retry.claimDueRetries(75_000, 5)
    expect(claimed.map((n) => n.id)).toEqual([id])
    expect(claimed[0]).toMatchObject({ orderId: 'ord-1', emailTries: 0 })
    expect(claimed[0]?.failedEmail?.toldWindow).toBe('2026-10-26 13:45-15:45')
    // Leased: a second link, or the same one again, gets nothing.
    expect(await retry.claimDueRetries(75_000, 5)).toEqual([])
    expect(await retry.claimNoteForResend(id, 'ord-1', 75_000)).toBeNull()
  })

  it('two claims racing take a note between them once', async () => {
    const id = await freshNote()
    await makeDue(id)
    const [a, b] = await Promise.all([retry.claimDueRetries(75_000, 5), retry.claimDueRetries(75_000, 5)])
    expect(a.length + b.length).toBe(1)
  })

  it('a failed try books the next one, counts, and keeps what the service said', async () => {
    const id = await freshNote()
    const after = await retry.recordFailedTry(id, 'Greeting never received', { gapMs: 10_000, restartForMs: null })
    expect(after).toMatchObject({ emailTries: 1 })
    expect(after?.emailNextTryAt).not.toBeNull()
    expect(after?.failedEmail).toMatchObject({ lastError: 'Greeting never received', subject: 'Booked in' })
    const row = await note(id)
    expect(row.email_lease_until).toBeNull()
    expect(Number(row.next_in)).toBeGreaterThan(5)
  })

  it('a failed try past the end of the five minutes stops the tries', async () => {
    const id = await freshNote()
    await client.query(`UPDATE "shp_order_notes" SET "email_retry_until" = CURRENT_TIMESTAMP + interval '2 seconds' WHERE "id" = $1`, [id])
    const after = await retry.recordFailedTry(id, 'still down', { gapMs: 10_000, restartForMs: null })
    expect(after?.emailNextTryAt).toBeNull()
  })

  it('a failed Resend on a note that had stopped starts five fresh minutes', async () => {
    const id = await retry.insertFailedEmailNote('ord-1', 'Email not sent', EMAIL, null)
    const after = await retry.recordFailedTry(id!, 'down', { gapMs: 10_000, restartForMs: 300_000 })
    expect(after?.emailNextTryAt).not.toBeNull()
    expect(Number((await note(id!)).until_in)).toBeGreaterThan(290)
  })

  it('Resend is scoped to its order, and refused once the email has settled', async () => {
    const id = await freshNote()
    expect(await retry.claimNoteForResend(id, 'ord-2', 75_000)).toBeNull()
    expect((await retry.claimNoteForResend(id, 'ord-1', 75_000))?.id).toBe(id)

    const other = await freshNote()
    await retry.settleEmailNote(other, 'Email sent')
    expect(await retry.claimNoteForResend(other, 'ord-1', 75_000)).toBeNull()
    const row = await note(other)
    expect(row).toMatchObject({ content: 'Email sent', email_next_try_at: null, email_lease_until: null })
    expect(row.email_settled_at).not.toBeNull()
  })

  it('stops the retries whose time is up, but not one being sent', async () => {
    const expired = await freshNote()
    const sending = await freshNote()
    const live = await freshNote()
    await client.query(`UPDATE "shp_order_notes" SET "email_retry_until" = CURRENT_TIMESTAMP - interval '1 second' WHERE "id" IN ($1, $2)`, [expired, sending])
    await client.query(`UPDATE "shp_order_notes" SET "email_lease_until" = CURRENT_TIMESTAMP + interval '60 seconds' WHERE "id" = $1`, [sending])
    const stopped = await retry.stopExpiredRetries()
    expect(stopped.map((n) => n.id)).toEqual([expired])
    expect((await note(expired)).email_next_try_at).toBeNull()
    expect((await note(live)).email_next_try_at).not.toBeNull()
  })

  it('says how long until the next try, counting a lease, and null with nothing trying', async () => {
    expect(await retry.msUntilNextRetry()).toBeNull()
    const id = await freshNote()
    const wait = await retry.msUntilNextRetry()
    expect(wait).toBeGreaterThan(5_000)
    expect(wait).toBeLessThanOrEqual(10_500)
    await makeDue(id)
    expect(await retry.msUntilNextRetry()).toBe(0)
    await retry.claimDueRetries(75_000, 5)
    expect(await retry.msUntilNextRetry()).toBeGreaterThan(70_000)
  })

  it('finds the unsent emails about one parcel, among the triggers asked for', async () => {
    const slot = await freshNote()
    await retry.insertFailedEmailNote('ord-1', 'x', { ...EMAIL, shipmentId: 'shp-2' }, null)
    await retry.insertFailedEmailNote('ord-1', 'x', { ...EMAIL, trigger: 'TRACKING_ADDED' }, null)
    const settled = await freshNote()
    await retry.settleEmailNote(settled, 'gone')
    const found = await retry.openEmailsForShipment('ord-1', 'shp-1', ['DELIVERY_SLOT_CONFIRMED', 'DELIVERY_DELAYED'])
    expect(found.map((n) => n.id)).toEqual([slot])
    expect(await retry.openEmailsForShipment('ord-1', 'shp-1', [])).toEqual([])
  })
})
