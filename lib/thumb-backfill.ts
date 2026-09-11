// Filling in `shp_product_media.thumb_url` for pictures that predate it.
//
// A shop that has been running a while has every product photograph it will ever
// have and no small copies of any of them, and the ordinary path that makes one
// (setProductMedia, on save) only fires when somebody edits a product. So the
// catalogue needs one sweep - 27,814 pictures on the install this was written
// for, 3.76 GB of originals read once each.
//
// Written to be run repeatedly rather than to run once perfectly. It picks up
// rows with no small copy, does as many as it is asked for, and stops; run it
// again and it carries on from where the last one left off, because "where it
// left off" is simply "which rows are still null". A machine that falls over
// halfway through loses whatever the current batch was doing and nothing else.
//
// Two reasons a url can come back with no copy, and neither is an error worth
// stopping for: core declined to make one (an external host with no bytes to
// read, a format that should not be shrunk, a picture already small enough), or
// the encode failed. Both leave the row null, the renderer falls back to the
// original, and the next sweep tries again for the price of one lookup.

import { prisma } from '@/lib/db/prisma'
import { generateImageRendition } from '@/lib/media/renditions'
import {
  THUMB_RENDITION_MAX_PX,
  THUMB_RENDITION_SUFFIX,
  THUMB_RENDITION_WORTHWHILE_BYTES,
} from '@/lib/media/thumb-renditions'
import { resolveThumbUrls } from '@/modules/shop/lib/thumb-renditions'

export type ThumbBackfillProgress = {
  /** Distinct pictures looked at so far in this run. */
  seen: number
  /** Of those, ones that now have a small copy - made here or already on file. */
  copied: number
  /** Product media rows pointed at a small copy. More than `copied`: one picture can sit on several products. */
  rowsUpdated: number
}

export type ThumbBackfillResult = ThumbBackfillProgress & {
  /** Pictures still with no small copy after this run - failures and declines both. */
  skipped: number
  /** Whether anything was left for the next run. */
  more: boolean
}

/** How many product pictures still have no small copy. The number the sweep is working through. */
export async function countProductThumbsPending(): Promise<number> {
  const rows = await prisma.$queryRaw<{ n: bigint }[]>`
    SELECT COUNT(DISTINCT "url") AS n FROM "shp_product_media"
    WHERE "type" = 'IMAGE' AND "thumb_url" IS NULL
  `
  return Number(rows[0]?.n ?? 0)
}

/**
 * Make the small copies for up to `limit` pictures and point their product media
 * rows at them.
 *
 * Works in distinct URLS, not rows: the same photograph sits on several products
 * on a catalogue with variations, and reading, decoding and encoding it once per
 * row would have made a long job several times longer. One copy is made and every
 * row naming that url is pointed at it.
 *
 * `concurrency` is how many pictures are in flight at once. The work is almost
 * entirely waiting on the object store, so a handful in parallel is several times
 * quicker than one at a time; too many and the store starts refusing. Four is a
 * settled default, and the whole thing is restartable anyway.
 */
export async function backfillProductThumbs(opts?: {
  limit?: number
  concurrency?: number
  dryRun?: boolean
  onProgress?: (p: ThumbBackfillProgress) => void
}): Promise<ThumbBackfillResult> {
  const limit = opts?.limit ?? 200
  const concurrency = Math.max(1, opts?.concurrency ?? 4)
  const dryRun = opts?.dryRun ?? false

  // One more than asked for, purely to answer "is there more after this?" without
  // a second COUNT over a table this size.
  const rows = await prisma.$queryRaw<{ url: string }[]>`
    SELECT DISTINCT "url" FROM "shp_product_media"
    WHERE "type" = 'IMAGE' AND "thumb_url" IS NULL
    LIMIT ${limit + 1}
  `
  const more = rows.length > limit
  const urls = rows.slice(0, limit).map((r) => r.url)

  const progress: ThumbBackfillProgress = { seen: 0, copied: 0, rowsUpdated: 0 }
  if (urls.length === 0) return { ...progress, skipped: 0, more: false }

  if (dryRun) {
    // What a real run would find already on file, without making anything. The
    // honest answer to "how much of this is actually work?" - a shop whose
    // pictures were shrunk by an earlier partial run has most of them already.
    const existing = await resolveThumbUrls(urls)
    return {
      seen: urls.length,
      copied: existing.size,
      rowsUpdated: 0,
      skipped: urls.length - existing.size,
      more,
    }
  }

  // Which of these already have a copy, for the whole batch in two queries. This
  // is not a rare case: a partial run leaves the file made and the column unset
  // if it stopped between the two, and several products routinely share a
  // photograph. Asking per picture instead would have been two queries each.
  const results = await resolveThumbUrls(urls)
  progress.copied = results.size
  const missing = urls.filter((u) => !results.has(u))
  progress.seen = results.size

  // A plain index-sharing pool rather than chunked batches: a batch waits for its
  // slowest picture before starting the next, and product photographs vary from
  // 30 KB to 6 MB, so a chunk of four spent most of its life waiting on one.
  let next = 0
  async function worker() {
    for (;;) {
      const at = next++
      const url = missing[at]
      if (!url) return
      // Returns null rather than throwing on anything it cannot do - an external
      // host, a format not worth shrinking, a decode that failed. All of those
      // leave the row null, which renders from the original and is tried again on
      // the next sweep.
      const thumb = await generateImageRendition(url, {
        maxPx: THUMB_RENDITION_MAX_PX,
        suffix: THUMB_RENDITION_SUFFIX,
        worthwhileBytes: THUMB_RENDITION_WORTHWHILE_BYTES,
      })
      progress.seen += 1
      if (thumb) {
        results.set(url, thumb)
        progress.copied += 1
      }
      opts?.onProgress?.({ ...progress })
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, missing.length) }, worker))

  // Written per url rather than in one statement per row: the same picture can be
  // on a hundred products, and this is one round trip for the lot of them.
  for (const [url, thumb] of results) {
    const updated = await prisma.$executeRaw`
      UPDATE "shp_product_media" SET "thumb_url" = ${thumb}
      WHERE "url" = ${url} AND "type" = 'IMAGE' AND "thumb_url" IS NULL
    `
    progress.rowsUpdated += updated
  }

  return { ...progress, skipped: progress.seen - progress.copied, more }
}

/**
 * Make the small copies WITHOUT touching `shp_product_media` at all.
 *
 * The two halves of a backfill are independent, and they become available at
 * different times. Making the files is hours of reading, decoding and encoding,
 * and needs nothing of the shop's schema - it reads urls and writes media library
 * items. Pointing the product rows at them is a column update that takes minutes,
 * and needs the column, which arrives with the module's own migration on the
 * install's next deploy.
 *
 * So on a shop whose pictures were all uploaded before any of this existed, the
 * long half can run first and the short half straight after the update, rather
 * than the whole thing waiting on a deploy. Run `backfillProductThumbs` afterwards
 * and it finds every copy already on file and does nothing but write the column.
 *
 * `after` is the url the last page ended on - this walks the catalogue in url
 * order rather than by what is outstanding, because with no column there is
 * nothing to mark as done. Resumable by passing the last url back.
 */
export async function backfillThumbFiles(opts?: {
  after?: string
  pageSize?: number
  concurrency?: number
  onProgress?: (p: ThumbBackfillProgress) => void
}): Promise<ThumbBackfillResult & { lastUrl: string | null }> {
  const pageSize = opts?.pageSize ?? 200
  const concurrency = Math.max(1, opts?.concurrency ?? 4)
  const after = opts?.after ?? ''

  const rows = await prisma.$queryRaw<{ url: string }[]>`
    SELECT DISTINCT "url" FROM "shp_product_media"
    WHERE "type" = 'IMAGE' AND "url" > ${after}
    ORDER BY "url" ASC
    LIMIT ${pageSize}
  `
  const urls = rows.map((r) => r.url)
  const progress: ThumbBackfillProgress = { seen: 0, copied: 0, rowsUpdated: 0 }
  if (urls.length === 0) return { ...progress, skipped: 0, more: false, lastUrl: null }

  const existing = await resolveThumbUrls(urls)
  progress.seen = existing.size
  progress.copied = existing.size
  const missing = urls.filter((u) => !existing.has(u))

  let next = 0
  async function worker() {
    for (;;) {
      const at = next++
      const url = missing[at]
      if (!url) return
      const thumb = await generateImageRendition(url, {
        maxPx: THUMB_RENDITION_MAX_PX,
        suffix: THUMB_RENDITION_SUFFIX,
        worthwhileBytes: THUMB_RENDITION_WORTHWHILE_BYTES,
      })
      progress.seen += 1
      if (thumb) progress.copied += 1
      opts?.onProgress?.({ ...progress })
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, missing.length) }, worker))

  return {
    ...progress,
    skipped: progress.seen - progress.copied,
    more: urls.length === pageSize,
    lastUrl: urls[urls.length - 1] ?? null,
  }
}
