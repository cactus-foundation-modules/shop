import { prisma } from '@/lib/db/prisma'
import { Prisma } from '@prisma/client'
import { getProductById } from '@/modules/shop/lib/db/products'

export type SlugRedirectTarget =
  | { kind: 'product'; slug: string }
  | { kind: 'path'; path: string }

/** Whether a bare slug is held by a forwarding rule (for root-slug claims). */
export async function hasProductSlugRedirect(slug: string): Promise<boolean> {
  const rows = await prisma.$queryRaw<Array<{ slug: string }>>`
    SELECT "slug" FROM "shp_product_slug_redirects" WHERE "slug" = ${slug} LIMIT 1
  `
  return rows.length > 0
}

/** Where an old product address should land, or null if it is not forwarded. */
export async function resolveProductSlugRedirect(slug: string): Promise<SlugRedirectTarget | null> {
  const rows = await prisma.$queryRaw<Array<{ target_slug: string | null; target_path: string | null }>>`
    SELECT "target_slug", "target_path" FROM "shp_product_slug_redirects" WHERE "slug" = ${slug} LIMIT 1
  `
  const row = rows[0]
  if (!row) return null
  if (row.target_path) return { kind: 'path', path: row.target_path }
  if (row.target_slug) return { kind: 'product', slug: row.target_slug }
  return null
}

/** One old address -> another product's current slug. Flattens chains (A→B then B→C leaves A→C). */
export async function recordProductSlugRedirect(fromSlug: string, toSlug: string): Promise<void> {
  const from = fromSlug.trim()
  const to = toSlug.trim()
  if (!from || !to || from === to) return

  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`
      UPDATE "shp_product_slug_redirects"
      SET "target_slug" = ${to}
      WHERE "target_slug" = ${from}
    `
    await tx.$executeRaw`
      INSERT INTO "shp_product_slug_redirects" ("slug", "target_slug", "target_path")
      VALUES (${from}, ${to}, NULL)
      ON CONFLICT ("slug") DO UPDATE
      SET "target_slug" = EXCLUDED."target_slug", "target_path" = NULL
    `
  })
}

export async function recordProductSlugRedirects(pairs: ReadonlyArray<{ from: string; to: string }>): Promise<void> {
  for (const { from, to } of pairs) {
    if (from !== to) await recordProductSlugRedirect(from, to)
  }
}

/** Send every listed old slug to the same place (delete flow). */
export async function recordProductSlugRedirectTarget(
  fromSlugs: readonly string[],
  target: { productSlug: string } | { path: string },
): Promise<void> {
  const unique = [...new Set(fromSlugs.map((s) => s.trim()).filter(Boolean))]
  if (unique.length === 0) return

  if ('path' in target) {
    const path = target.path.trim()
    if (!path.startsWith('/')) return
    for (const slug of unique) {
      await prisma.$executeRaw`
        INSERT INTO "shp_product_slug_redirects" ("slug", "target_slug", "target_path")
        VALUES (${slug}, NULL, ${path})
        ON CONFLICT ("slug") DO UPDATE
        SET "target_slug" = NULL, "target_path" = EXCLUDED."target_path"
      `
    }
    return
  }

  const toSlug = target.productSlug.trim()
  if (!toSlug) return
  await recordProductSlugRedirects(unique.map((from) => ({ from, to: toSlug })))
}

/** This product's slug and every variation child's slug, for delete forwarding. */
export async function collectProductRedirectSlugs(productId: string): Promise<string[]> {
  const product = await getProductById(productId)
  if (!product?.slug) return []

  const slugs = new Set<string>([product.slug])
  try {
    const children = await prisma.$queryRaw<Array<{ slug: string }>>`
      SELECT c."slug"
      FROM "svr_variants" v
      JOIN "shp_products" c ON c."id" = v."child_product_id"
      WHERE v."parent_product_id" = ${productId}
    `
    for (const c of children) {
      if (c.slug) slugs.add(c.slug)
    }
  } catch (err) {
    if (!isMissingRelation(err)) throw err
  }
  return [...slugs]
}

function isMissingRelation(err: unknown): boolean {
  if (!(err instanceof Prisma.PrismaClientKnownRequestError)) return false
  if (err.code === 'P2010' && String(err.meta?.message ?? '').includes('does not exist')) return true
  return err.code === 'P2021'
}

/** Parse optional delete redirect: `/path` or another product's slug. */
export function parseDeleteRedirectTarget(raw: string | null | undefined): { productSlug: string } | { path: string } | null {
  const t = raw?.trim()
  if (!t) return null
  if (t.startsWith('/')) return { path: t }
  const slug = t.replace(/^\/+|\/+$/g, '')
  if (!slug || !/^[a-z0-9-]+$/i.test(slug)) return null
  return { productSlug: slug.toLowerCase() }
}
