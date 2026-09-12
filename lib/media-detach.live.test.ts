import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { TestDatabase, TestRole, VpsConfig } from '@/lib/backup/vps-database'

// The media DETACHERS' raw SQL, ACTUALLY EXECUTED by Postgres.
//
// Nothing else runs it. `tsc` sees a string, `eslint` sees a string, `npm test`
// never opens a connection, and the module build gate builds - which never
// executes a query either. So a statement Postgres will not parse passes every
// gate there is, and this one would fail for the first time on the click that
// deletes a live product photograph, half way through a delete that has already
// started.
//
// What is awkward here, and none of it visible to a type-checker:
//
//  - `UPDATE ... FROM (SELECT row_number() OVER (PARTITION BY ...)) AS r`, which
//    repacks the gallery's positions after a row is removed;
//  - `DISTINCT ON (product_id)` with an ORDER BY that has to START with exactly
//    that expression, inside an `IN (...)` subquery;
//  - a correlated `NOT EXISTS` against the very table being updated, which is
//    what stops a product that still has a primary photograph gaining a second;
//  - `"position"` as a column name - a function name in Postgres, so it is only
//    a column while it stays quoted.
//
// Every value import is dynamic: the shared Prisma client reads DATABASE_URL
// once, when its module first loads, and the database this runs against does not
// exist until beforeAll has made it.
//
// It provisions its OWN throwaway database on the self-hosted Postgres VPS
// (`cactus_rt_*`, owned by a throwaway role, dropped afterwards plus a
// prefix-scoped sweep), so it never touches any real database - the live site's
// sits on the same server and is never named, opened or altered. Skipped unless
// opted into, so a plain `npm test` never hits the network:
//
//   npm run test:media-detach
const shouldRun = process.env.RUN_MEDIA_DETACH === '1'
if (shouldRun) {
  try {
    ;(process as unknown as { loadEnvFile: (p: string) => void }).loadEnvFile('.env')
  } catch {
    // No .env - the guard below fails the suite loudly rather than skipping.
  }
}

const suite = shouldRun ? describe : describe.skip

const CORE_SQL = readFileSync(path.join(process.cwd(), 'prisma/migrations/20260626000000_init/migration.sql'), 'utf8')

/** Split a migration file into statements, dollar-quote aware. Its own splitter
 *  rather than the backup format's, which is not: these migrations DO use
 *  `DO $$ ... $$`, and teaching the backup splitter about it would be scope
 *  creep on the one file nobody should be casual with. */
function splitStatements(sql: string): string[] {
  const out: string[] = []
  let current = ''
  let at = 0
  while (at < sql.length) {
    const rest = sql.slice(at)
    if (rest.startsWith('--')) {
      const end = sql.indexOf('\n', at)
      at = end === -1 ? sql.length : end + 1
      continue
    }
    if (rest.startsWith('/*')) {
      const end = sql.indexOf('*/', at + 2)
      at = end === -1 ? sql.length : end + 2
      continue
    }
    const char = sql[at]!
    if (char === "'" || char === '"') {
      const end = closingQuote(sql, at, char)
      current += sql.slice(at, end)
      at = end
      continue
    }
    const dollar = /^\$[A-Za-z_]*\$/.exec(rest)
    if (dollar) {
      const tag = dollar[0]
      const end = sql.indexOf(tag, at + tag.length)
      const stop = end === -1 ? sql.length : end + tag.length
      current += sql.slice(at, stop)
      at = stop
      continue
    }
    if (char === ';') {
      if (current.trim()) out.push(current.trim())
      current = ''
      at++
      continue
    }
    current += char
    at++
  }
  if (current.trim()) out.push(current.trim())
  return out
}

/** Where a quoted run ends, doubled quotes ('' and "") counting as escapes. */
function closingQuote(sql: string, start: number, quote: string): number {
  let at = start + 1
  while (at < sql.length) {
    if (sql[at] === quote) {
      if (sql[at + 1] === quote) {
        at += 2
        continue
      }
      return at + 1
    }
    at++
  }
  return sql.length
}

function moduleSql(moduleName: string): string[] {
  const dir = path.join(process.cwd(), 'modules', moduleName, 'migrations')
  return readdirSync(dir)
    .filter((file) => file.endsWith('.sql'))
    .sort()
    .flatMap((file) => splitStatements(readFileSync(path.join(dir, file), 'utf8')))
}

const DOOMED_URL = 'https://media.example/media/shop/chairs/iris/aaa-iris.webp'
const DOOMED_ID = 'media-doomed'
const DOOMED_KEY = 'media/shop/chairs/iris/aaa-iris.webp'
const SURVIVOR_URL = 'https://media.example/media/shop/chairs/iris/bbb-iris-2.webp'
const THIRD_URL = 'https://media.example/media/shop/chairs/iris/ccc-iris-3.webp'

suite('media reference detachers, against a real Postgres', () => {
  let cfg: VpsConfig
  let role: TestRole
  let database: TestDatabase
  const stamp = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
  const dbName = `cactus_rt_mdet_${stamp}`
  const roleName = `cactus_rt_role_mdet_${stamp}`

  type DbModules = {
    prisma: typeof import('@/lib/db/prisma')
    shop: typeof import('@/modules/shop/lib/media-reference-detacher')
    variations: typeof import('@/modules/shop-variations/lib/media-reference-detacher')
  }
  let db: DbModules
  let vps: typeof import('@/lib/backup/vps-database')

  let productId = ''
  let otherProductId = ''
  let categoryId = ''
  let collectionId = ''
  let optionValueId = ''

  beforeAll(async () => {
    vps = await import('@/lib/backup/vps-database')
    cfg = vps.vpsConfigFromEnv()
    await vps.dropStaleTestObjects(cfg)
    role = await vps.createTestRole(cfg, roleName)
    database = await vps.createTestDatabase(cfg, dbName, role)
    process.env.DATABASE_URL = database.connectionUri
    process.env.DIRECT_URL = database.connectionUri

    db = {
      prisma: await import('@/lib/db/prisma'),
      shop: await import('@/modules/shop/lib/media-reference-detacher'),
      variations: await import('@/modules/shop-variations/lib/media-reference-detacher'),
    }

    // A freshly-created database takes a moment to accept connections.
    for (let attempt = 0; ; attempt++) {
      try {
        await db.prisma.prisma.$queryRawUnsafe('SELECT 1')
        break
      } catch (err) {
        if (attempt >= 15) throw err
        await new Promise((r) => setTimeout(r, 2000))
      }
    }

    const sql = db.prisma.prisma
    for (const statement of splitStatements(CORE_SQL)) await sql.$executeRawUnsafe(statement)
    for (const moduleName of ['shop', 'shop-variations']) {
      for (const statement of moduleSql(moduleName)) await sql.$executeRawUnsafe(statement)
    }

    const one = async (rows: Promise<{ id: string }[]>): Promise<string> => (await rows)[0]!.id

    productId = await one(sql.$queryRaw`
      INSERT INTO "shp_products" ("name", "slug", "type", "price", "og_image_id")
      VALUES ('Iris chair', 'iris-chair', 'PHYSICAL', 83.00, ${DOOMED_ID}) RETURNING "id"
    `)
    // A second product using the SAME photograph, because one picture sits on
    // several listings on any catalogue with variations - and because a repack
    // that leaked across products would be invisible with only one.
    otherProductId = await one(sql.$queryRaw`
      INSERT INTO "shp_products" ("name", "slug", "type", "price")
      VALUES ('Iris stool', 'iris-stool', 'PHYSICAL', 59.00) RETURNING "id"
    `)
    categoryId = await one(sql.$queryRaw`
      INSERT INTO "shp_categories" ("name", "slug", "image_url", "og_image_id")
      VALUES ('Chairs', 'chairs', ${DOOMED_URL}, ${DOOMED_ID}) RETURNING "id"
    `)
    collectionId = await one(sql.$queryRaw`
      INSERT INTO "shp_collections" ("name", "slug", "image_id", "og_image_id")
      VALUES ('Sale', 'sale', ${DOOMED_ID}, ${DOOMED_ID}) RETURNING "id"
    `)

    // The gallery: the doomed picture is the PRIMARY one at position 0, so
    // deleting it has to promote a replacement as well as close the gap. The
    // survivor at position 1 carries the doomed item as its small copy, which
    // must be nulled rather than dropped.
    await sql.$executeRaw`
      INSERT INTO "shp_product_media" ("product_id", "type", "url", "thumb_url", "position", "is_primary") VALUES
        (${productId}, 'IMAGE', ${DOOMED_URL}, NULL, 0, true),
        (${productId}, 'IMAGE', ${SURVIVOR_URL}, ${DOOMED_URL}, 1, false),
        (${productId}, 'IMAGE', ${THIRD_URL}, NULL, 2, false)
    `
    // The other product keeps its own primary, so it must NOT gain a second.
    await sql.$executeRaw`
      INSERT INTO "shp_product_media" ("product_id", "type", "url", "position", "is_primary") VALUES
        (${otherProductId}, 'IMAGE', ${SURVIVOR_URL}, 0, true),
        (${otherProductId}, 'IMAGE', ${DOOMED_URL}, 1, false)
    `

    const optionId = await one(sql.$queryRaw`
      INSERT INTO "svr_options" ("product_id", "name", "control_type")
      VALUES (${productId}, 'Upholstery Colour', 'SWATCH') RETURNING "id"
    `)
    optionValueId = await one(sql.$queryRaw`
      INSERT INTO "svr_option_values" ("option_id", "label", "slug", "swatch")
      VALUES (${optionId}, 'Rivet Teal', 'rivet-teal', ${DOOMED_URL}) RETURNING "id"
    `)

    await db.shop.shopMediaReferenceDetacher({ id: DOOMED_ID, url: DOOMED_URL, key: DOOMED_KEY })
    await db.variations.shopVariationsMediaReferenceDetacher({ id: DOOMED_ID, url: DOOMED_URL, key: DOOMED_KEY })
  }, 300_000)

  afterAll(async () => {
    try {
      await db?.prisma?.prisma?.$disconnect()
    } catch {
      // Nothing to disconnect if the suite never got that far.
    }
    if (cfg) {
      if (database) await vps.dropTestDatabase(cfg, database.name)
      if (role) await vps.dropTestRole(cfg, role.name)
      await vps.dropStaleTestObjects(cfg)
    }
  }, 300_000)

  it('drops the gallery row and closes the gap it left', async () => {
    const rows = await db.prisma.prisma.$queryRaw<{ url: string; position: number; is_primary: boolean }[]>`
      SELECT "url", "position", "is_primary" FROM "shp_product_media"
      WHERE "product_id" = ${productId} ORDER BY "position"
    `
    expect(rows.map((r) => r.url)).toEqual([SURVIVOR_URL, THIRD_URL])
    // Repacked, not left at 1 and 2: position is what the gallery orders by and
    // what the detail block counts against when it splits the first few off.
    expect(rows.map((r) => r.position)).toEqual([0, 1])
  })

  it('promotes a replacement when the picture deleted was the primary one', async () => {
    const primaries = await db.prisma.prisma.$queryRaw<{ url: string }[]>`
      SELECT "url" FROM "shp_product_media"
      WHERE "product_id" = ${productId} AND "is_primary"
    `
    expect(primaries.map((r) => r.url)).toEqual([SURVIVOR_URL])
  })

  it('leaves a product that still has its primary with exactly one', async () => {
    const rows = await db.prisma.prisma.$queryRaw<{ url: string; position: number; is_primary: boolean }[]>`
      SELECT "url", "position", "is_primary" FROM "shp_product_media"
      WHERE "product_id" = ${otherProductId} ORDER BY "position"
    `
    expect(rows).toEqual([{ url: SURVIVOR_URL, position: 0, is_primary: true }])
  })

  it('nulls a small copy rather than dropping the row that used it', async () => {
    const rows = await db.prisma.prisma.$queryRaw<{ thumb_url: string | null }[]>`
      SELECT "thumb_url" FROM "shp_product_media"
      WHERE "product_id" = ${productId} AND "url" = ${SURVIVOR_URL}
    `
    expect(rows).toEqual([{ thumb_url: null }])
  })

  it('clears the url and id columns on categories, collections and products', async () => {
    const category = await db.prisma.prisma.$queryRaw<{ image_url: string | null; og_image_id: string | null }[]>`
      SELECT "image_url", "og_image_id" FROM "shp_categories" WHERE "id" = ${categoryId}
    `
    expect(category).toEqual([{ image_url: null, og_image_id: null }])

    const collection = await db.prisma.prisma.$queryRaw<{ image_id: string | null; og_image_id: string | null }[]>`
      SELECT "image_id", "og_image_id" FROM "shp_collections" WHERE "id" = ${collectionId}
    `
    expect(collection).toEqual([{ image_id: null, og_image_id: null }])

    const product = await db.prisma.prisma.$queryRaw<{ og_image_id: string | null }[]>`
      SELECT "og_image_id" FROM "shp_products" WHERE "id" = ${productId}
    `
    expect(product).toEqual([{ og_image_id: null }])
  })

  it('blanks an option value swatch without removing the choice', async () => {
    const rows = await db.prisma.prisma.$queryRaw<{ label: string; swatch: string | null }[]>`
      SELECT "label", "swatch" FROM "svr_option_values" WHERE "id" = ${optionValueId}
    `
    // The fabric still exists and is still orderable; only its photograph went.
    expect(rows).toEqual([{ label: 'Rivet Teal', swatch: null }])
  })

  it('is idempotent - a second run over the same item changes nothing', async () => {
    await db.shop.shopMediaReferenceDetacher({ id: DOOMED_ID, url: DOOMED_URL, key: DOOMED_KEY })
    await db.variations.shopVariationsMediaReferenceDetacher({ id: DOOMED_ID, url: DOOMED_URL, key: DOOMED_KEY })

    const rows = await db.prisma.prisma.$queryRaw<{ url: string; position: number; is_primary: boolean }[]>`
      SELECT "url", "position", "is_primary" FROM "shp_product_media"
      WHERE "product_id" = ${productId} ORDER BY "position"
    `
    expect(rows).toEqual([
      { url: SURVIVOR_URL, position: 0, is_primary: true },
      { url: THIRD_URL, position: 1, is_primary: false },
    ])
  })
})
