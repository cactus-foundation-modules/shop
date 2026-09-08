import { getActiveMediaProvider, isMediaProviderConfigured } from '@/lib/config/env'
import { uploadMedia } from '@/lib/media/upload'

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
 * Fetch the courier's signature image and store it as the site's own.
 *
 * `reference` names the file for a human going through a bucket later - the
 * order number, typically. It is not what makes the object hard to find: the
 * key carries a random component of its own, exactly as an uploaded product
 * image does.
 */
export async function captureSignature(imageUrl: string, reference: string): Promise<CapturedSignature | null> {
  const provider = await getActiveMediaProvider()
  if (!provider || !isMediaProviderConfigured(provider)) return null

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(imageUrl, {
      signal: controller.signal,
      redirect: 'follow',
      headers: { 'user-agent': 'CactusShopDeliveryTracking/1.0 (+proof of delivery)' },
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

    const filename = `delivery-signature-${reference}.${EXTENSION[mimeType]}`
    const stored = await uploadMedia(buffer, mimeType, provider, filename)
    return stored.key && stored.url ? { url: stored.url, key: stored.key } : null
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}
