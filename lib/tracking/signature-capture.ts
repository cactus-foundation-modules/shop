import { getActiveMediaProvider, isMediaProviderConfigured } from '@/lib/config/env'
import { buildLibraryUploadKey, saveMediaRecord, uploadMedia } from '@/lib/media/upload'
import { getOrCreateFolderByPath, resolveFolderPath } from '@/lib/media/organise'

// Taking our own copy of a proof of delivery.
//
// WHY COPY IT AT ALL
//
// The courier's signature lives on a third party's public bucket, under a
// filename of their choosing, for as long as they feel like keeping it. A
// proof of delivery that evaporates when somebody tidies a bucket is not proof
// of anything - and it is wanted precisely on the day there is an argument,
// which is never the day it was taken.
//
// WHY THE BYTES DECIDE THE TYPE
//
// The first one of these seen in the wild was served as `signature_….png` and
// was a JPEG. Storing it by its extension writes an object labelled PNG holding
// JPEG bytes, which some browsers refuse outright and every image pipeline
// downstream then gets wrong. The magic number is the only honest source.
//
// WHY IT IS A LIBRARY ITEM AND NOT JUST AN OBJECT
//
// Writing the bytes to the bucket is not keeping them. An object with no Media
// row behind it is, to every part of core that counts anything, a leftover: the
// storage check lists it under "orphaned" - an object nothing owns - and offers
// it up for deletion in a batch. That is exactly what happened to the first one
// taken (order DW000172, binned within the week), because the shop never minted
// a row for it and never told the usage index it existed. So the picture is
// filed properly - a real library item, in Orders / <order number> / Proof of
// delivery, beside the issue photographs for the same order - AND the shop's
// media usage provider returns the column it lives in, which is the belt to
// that braces: even an item somebody moves out of the folder still reads as in
// use rather than as spare.
//
// Failure here is never allowed to matter: a signature that cannot be fetched,
// is not an image, or arrives while media storage is unconfigured returns null,
// and the parcel is still delivered. The delivery is the fact; the picture is
// evidence attached to it.

export type CapturedSignature = { url: string; key: string }

/** Per request. Their bucket is fast; a slow one must not hold a scheduled run
 *  open behind it. */
const TIMEOUT_MS = 8000

/** Generous for a signature - the first real one was 64 KB - and small enough
 *  that a courier serving something unexpected cannot fill a bucket. */
const MAX_BYTES = 5 * 1024 * 1024

/** What the first bytes say this actually is. Only the three formats a browser
 *  will render inline; anything else is not a signature we can show, whatever
 *  its extension claims. */
function sniffImageType(bytes: Uint8Array): string | null {
  if (bytes.length < 12) return null
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg'
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png'
  const riff = String.fromCharCode(...bytes.slice(0, 4))
  const webp = String.fromCharCode(...bytes.slice(8, 12))
  if (riff === 'RIFF' && webp === 'WEBP') return 'image/webp'
  return null
}

const EXTENSION: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

/**
 * Fetch the courier's proof of delivery and store it as the site's own.
 *
 * `reference` names the file for a human going through a bucket later - the
 * order number, typically. It is not what makes the object hard to find: the
 * key carries a random component of its own, exactly as an uploaded product
 * image does.
 *
 * `options.headers` exists because not every courier serves the picture from a
 * public bucket. DPD's is behind the same session as the parcel's own data AND
 * refuses a Referer that names the parcel - a bare `https://track.dpd.co.uk/`
 * is accepted where the full tracking address is 403ed, `*` and all. The
 * caller holds that session, so it passes the headers rather than this file
 * learning who DPD are.
 *
 * `options.label` names the file. A signature and a photograph of a parcel on a
 * doorstep are both proof of delivery and are stored the same way, but a bucket
 * full of things called "signature" that are photographs helps nobody.
 *
 * `options.orderNumber` decides the folder. Given one, the item is filed under
 * Orders / <order number> / Proof of delivery; without one there is no order
 * folder to file into and it lands in the library root, still as a real item.
 */
export async function captureSignature(
  imageUrl: string,
  reference: string,
  options: { headers?: Record<string, string>; label?: string; orderNumber?: string | null } = {},
): Promise<CapturedSignature | null> {
  const provider = await getActiveMediaProvider()
  if (!provider || !isMediaProviderConfigured(provider)) return null

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(imageUrl, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'user-agent': 'CactusShopDeliveryTracking/1.0 (+proof of delivery)',
        ...(options.headers ?? {}),
      },
      cache: 'no-store',
    })
    if (!res.ok) return null

    // Checked before reading and again after: a Content-Length is a claim, and
    // a response that lies about it or omits it entirely still has to fit.
    const declared = Number(res.headers.get('content-length') ?? NaN)
    if (Number.isFinite(declared) && declared > MAX_BYTES) return null

    const buffer = Buffer.from(await res.arrayBuffer())
    if (buffer.length === 0 || buffer.length > MAX_BYTES) return null

    const mimeType = sniffImageType(buffer)
    if (!mimeType) return null

    const filename = `${options.label ?? 'delivery-signature'}-${reference}.${EXTENSION[mimeType]}`

    // The folder is walked into existence rather than looked up, so the first
    // proof of delivery on an order creates the tree and the second reuses it.
    const folderId = options.orderNumber
      ? await getOrCreateFolderByPath(['Orders', options.orderNumber, 'Proof of delivery'])
      : null
    const folderPath = folderId ? await resolveFolderPath(folderId) : undefined
    // Keeps the readable filename, suffixing "-2" only if that exact name is
    // already taken in this order's folder - a parcel re-delivered, or an order
    // that went out in two.
    const presetKey = await buildLibraryUploadKey(provider, mimeType, filename, folderPath)
    const stored = await uploadMedia(buffer, mimeType, provider, filename, folderPath, false, presetKey)
    if (!stored.key || !stored.url) return null

    const record = await saveMediaRecord({
      key: stored.key,
      url: stored.url,
      provider,
      mimeType: stored.mimeType,
      sizeBytes: stored.sizeBytes,
      originalName: filename,
      // Never rendered on a public page under its own description, so there is
      // no alt text to chase: the library's audit should not spend its life
      // asking the owner to describe a courier's scrawl.
      isDecorative: true,
      folderId,
    })
    // The row's url, not the upload's - a proxied provider serves through the
    // worker, and the row is the only thing that knows the canonical address.
    return { url: record.url, key: record.key }
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}
