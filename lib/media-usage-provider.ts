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
    -- The small copy a card and the thumbnail strip are drawn from. Nothing else
    -- in the shop points at it, so without this every one of them reads as spare
    -- and the library offers the lot up for deletion - which would take the
    -- catalogue's card pictures with it.
    SELECT "thumb_url" AS ref FROM "shp_product_media" WHERE "thumb_url" IS NOT NULL
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
    UNION ALL
    SELECT "image_url" AS ref FROM "shp_categories" WHERE "image_url" IS NOT NULL
    UNION ALL
    -- The designed description is a Puck document, and the feature videos and
    -- photographs inside it are addressed by url within the JSON. Returned whole
    -- as text (the contract allows it - core folds every string into one
    -- haystack), because picking the urls back out here would only duplicate the
    -- matching core already does. Without it a product's description videos read
    -- as unused: on Deskwell that was 232 live files sitting in the Unused tile
    -- with a delete button over them.
    SELECT "description_puck"::text AS ref FROM "shp_products" WHERE "description_puck" IS NOT NULL
    UNION ALL
    -- Categories and collections carry the same kind of document, built in the
    -- same builder, so their pictures count as used for the same reason.
    SELECT "description_puck"::text AS ref FROM "shp_categories" WHERE "description_puck" IS NOT NULL
    UNION ALL
    SELECT "description_puck"::text AS ref FROM "shp_collections" WHERE "description_puck" IS NOT NULL
    UNION ALL
    -- A customer's "Report an issue" photograph. Snapshotted as a url beside the
    -- library id (see the migration comment on the table), so both are checked -
    -- the id in case the url has since drifted, the url because it is what
    -- actually renders in the admin queue.
    SELECT "url" AS ref FROM "shp_order_request_photos"
    UNION ALL
    SELECT "media_id" AS ref FROM "shp_order_request_photos" WHERE "media_id" IS NOT NULL
    UNION ALL
    -- The shop's own copy of a courier's proof of delivery. It is a library item
    -- like any other (see lib/tracking/signature-capture.ts), so it would show in
    -- the "Unused" tile the moment it was filed - nothing in core can see the
    -- shipment row that points at it. Worse, before it was a library item at all
    -- the storage check read the object as an orphan and it was deleted: the one
    -- picture whose whole job is to exist on the day there is an argument.
    -- Both columns, because the url is what renders and the key is what storage
    -- is reconciled against.
    SELECT "signature_url" AS ref FROM "shp_shipments" WHERE "signature_url" IS NOT NULL
    UNION ALL
    SELECT "signature_key" AS ref FROM "shp_shipments" WHERE "signature_key" IS NOT NULL
  `
  return rows.map((r) => r.ref).filter((r): r is string => !!r)
}
