// The small copies behind `shp_product_media.thumb_url`.
//
// The resizing itself is core's (lib/media/renditions.ts) - there is nothing
// shop-specific about "make me a 300px copy of that", and the sizes live in core
// too (lib/media/thumb-renditions.ts) so the filters module and anything after it
// ask for the same file rather than minting a second one beside it.
//
// What is shop's is when to ask. Two entry points, because the two callers want
// very different things:
//
//   - resolveThumbUrls: look up copies that already exist. Two queries, no image
//     work at all. This is what a save uses, so re-saving a product with fifty
//     photographs costs nothing.
//   - ensureThumbUrls: the same, then make whatever is still missing. Each one is
//     a download, a decode and an upload, so it is bounded by a time budget and
//     hands back what it managed - the caller stores that and the sweep picks up
//     the rest.
//
// Why bounded rather than "do them all": this runs inside ordinary admin saves
// and inside bulk product imports. A catalogue import writing several thousand
// pictures cannot sit in a serverless function resizing them (module routes get
// 60 seconds), and an admin adding one photograph should not wait behind an
// import's backlog either. Whatever is left over is simply a row with a null
// thumb_url, which renders correctly - from the original - until the sweep
// reaches it.

import { findRenditionUrls, generateImageRendition } from '@/lib/media/renditions'
import {
  THUMB_RENDITION_MAX_PX,
  THUMB_RENDITION_SUFFIX,
  THUMB_RENDITION_WORTHWHILE_BYTES,
} from '@/lib/media/thumb-renditions'

/** How long `ensureThumbUrls` may spend making copies before it gives up and lets the sweep finish the job. */
const DEFAULT_BUDGET_MS = 20_000

/**
 * The small copies these pictures ALREADY have. No image work, so this is safe on
 * any path that cares how long it takes.
 *
 * Missing entries mean "no copy on file", which is the same answer as "no copy
 * possible" as far as a renderer is concerned - both fall back to the original.
 */
export async function resolveThumbUrls(urls: string[]): Promise<Map<string, string>> {
  return findRenditionUrls(urls, THUMB_RENDITION_SUFFIX)
}

/**
 * The small copies these pictures have, plus as many of the missing ones as the
 * budget allows.
 *
 * Returns the same shape as resolveThumbUrls: original url -> copy url, with
 * anything not made (not worth making, not reachable, or not reached before the
 * budget ran out) simply absent.
 *
 * A url that core declines to shrink comes back absent on every run, so a picture
 * on an external host or a format sharp should not touch is retried each sweep
 * and each time costs one cheap lookup. That is the right trade against keeping a
 * "we tried and it was hopeless" flag in sync with a library item that can be
 * replaced underneath it.
 */
export async function ensureThumbUrls(
  urls: string[],
  opts?: { userId?: string; budgetMs?: number },
): Promise<Map<string, string>> {
  const found = await resolveThumbUrls(urls)
  const missing = [...new Set(urls)].filter((u) => u && !found.has(u))
  if (missing.length === 0) return found

  const deadline = Date.now() + (opts?.budgetMs ?? DEFAULT_BUDGET_MS)
  for (const url of missing) {
    if (Date.now() >= deadline) break
    const made = await generateImageRendition(url, {
      maxPx: THUMB_RENDITION_MAX_PX,
      suffix: THUMB_RENDITION_SUFFIX,
      worthwhileBytes: THUMB_RENDITION_WORTHWHILE_BYTES,
      userId: opts?.userId,
    })
    if (made) found.set(url, made)
  }
  return found
}
