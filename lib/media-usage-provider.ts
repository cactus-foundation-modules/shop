import { prisma } from '@/lib/db/prisma'

// Provider for the core.media-usage-providers extension point.
//
// The media library's "Unused" tile offers up for deletion anything core cannot
// find a reference to, and core can only see its own tables and the Puck builder
// JSON. Every product photograph, collection cover, social-share image and
// digital-download file the shop owns is therefore invisible to it - a whole
// catalogue's worth of imagery counted as spare and one click from being binned.
//
// Hand core the raw strings these columns hold. Some are Media.url values, some
// are Media.id values; core matches an item's url, key and id against the lot, so
// there is nothing to resolve here - just return what is stored.
export async function shopMediaUsageProvider(): Promise<string[]> {
  const rows = await prisma.$queryRaw<{ ref: string | null }[]>`
    SELECT "url" AS ref FROM "shp_product_media"
    UNION ALL
    SELECT "url" AS ref FROM "shp_digital_files"
    UNION ALL
    SELECT "og_image_id" AS ref FROM "shp_products" WHERE "og_image_id" IS NOT NULL
    UNION ALL
    SELECT "image_id" AS ref FROM "shp_collections" WHERE "image_id" IS NOT NULL
    UNION ALL
    SELECT "og_image_id" AS ref FROM "shp_collections" WHERE "og_image_id" IS NOT NULL
    UNION ALL
    SELECT "og_image_id" AS ref FROM "shp_categories" WHERE "og_image_id" IS NOT NULL
  `
  return rows.map((r) => r.ref).filter((r): r is string => !!r)
}
