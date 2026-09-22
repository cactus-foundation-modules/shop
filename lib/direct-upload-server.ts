import { randomUUID } from 'node:crypto'
import type { MediaProviderType } from '@prisma/client'
import { deleteMedia, headMediaSize, isS3Provider, mediaKeyPrefix } from '@/lib/media/upload'
import { workerUrl } from '@/lib/media/worker-url'
import { signUploadToken, verifyUploadToken } from '@/lib/media/upload-token'
import { tooLargeReason } from '@/lib/media/limits'
import {
  DIRECT_UPLOAD_CONTENT_TYPE,
  buildShopUploadKey,
  isShopUploadKey,
  type ShopUploadPurpose,
} from '@/modules/shop/lib/direct-upload'

// The server's half of a shop upload that goes straight to storage (see
// lib/direct-upload.ts for why it exists and what it is for).
//
// Two calls bracket the browser's PUT. The first signs a key; the second is told
// the key and the token afterwards and checks what actually landed, because the
// bytes never passed through the site and the browser's account of them is not
// evidence. Nothing about the object is taken from the request: where it is comes
// from a key this site signed, in this purpose's own folder, and how big it is
// comes from storage.

export type ShopUploadTicket =
  | { available: false }
  | { available: true; uploadUrl: string; key: string; token: string; contentType: string }

/**
 * A signed place in storage for one file, or `{ available: false }` when this
 * site's storage cannot take a file from the browser: only the S3-style
 * providers accept a Worker write, and only when there is a Worker to write to.
 * The same contract core's own /api/admin/media/upload-url keeps.
 */
export function issueShopUploadTicket(provider: MediaProviderType, purpose: ShopUploadPurpose, filename: string): ShopUploadTicket {
  const base = workerUrl()
  if (!base || !isS3Provider(provider)) return { available: false }
  const key = buildShopUploadKey(mediaKeyPrefix(provider), purpose, randomUUID(), filename)
  const { token } = signUploadToken(key)
  return { available: true, uploadUrl: `${base}/${key}`, key, token, contentType: DIRECT_UPLOAD_CONTENT_TYPE }
}

export type LandedUpload =
  | { ok: true; key: string; url: string; sizeBytes: number }
  | { ok: false; status: number; error: string }

/**
 * Check a directly uploaded file before anything is done with it: that the key
 * is one this purpose signs for a file of this name, that the token is the one
 * the site issued for it and is still in date, that the object is really there,
 * and that what storage holds is within `maxBytes`.
 *
 * An object over the ceiling is removed here and then refused, so nothing the
 * shop would never use is left behind. One whose key or token does not check out
 * is left alone: nothing about it has been proved to be the caller's to delete.
 * The media page's storage check lists anything stranded that way as a leftover.
 *
 * The url handed back is built here from the key, never taken from the request.
 * It is what the download route will later fetch server-side, so a url from the
 * browser would be a way to make the site fetch anything at all.
 */
export async function checkLandedUpload(input: {
  provider: MediaProviderType
  purpose: ShopUploadPurpose
  filename: string
  key: string
  token: string
  maxBytes: number
  /** Said after the "too big" sentence, when there is something to do about it. */
  tooLargeAdvice?: string
}): Promise<LandedUpload> {
  const { provider, purpose, filename, key, token, maxBytes } = input
  const base = workerUrl()
  if (!base || !isS3Provider(provider) || !isShopUploadKey(key, mediaKeyPrefix(provider), purpose, filename)) {
    return { ok: false, status: 400, error: 'That upload does not belong here. Try uploading the file again.' }
  }
  if (!verifyUploadToken(key, token)) {
    return { ok: false, status: 403, error: `"${filename}" took too long to arrive and its upload has expired. Try uploading it again.` }
  }

  // Storage has the final word on size. null covers both "not there" and "could
  // not be asked", and either way there is nothing safe to record.
  const sizeBytes = await headMediaSize(provider, key)
  if (sizeBytes === null) {
    return { ok: false, status: 502, error: `"${filename}" did not reach storage, or storage could not be asked about it. Try uploading it again.` }
  }
  if (sizeBytes <= 0) {
    await discardShopUpload(provider, key)
    return { ok: false, status: 400, error: `"${filename}" arrived empty. Check the file opens on your computer, then upload it again.` }
  }
  if (sizeBytes > maxBytes) {
    await discardShopUpload(provider, key)
    const advice = input.tooLargeAdvice ? ` ${input.tooLargeAdvice}` : ''
    return { ok: false, status: 413, error: `"${filename}": ${tooLargeReason(sizeBytes, maxBytes / 1024 / 1024)}${advice}` }
  }

  return { ok: true, key, url: `${base}/${key}`, sizeBytes }
}

/**
 * Remove an uploaded object the shop has finished with or refused. Never throws:
 * by the time this runs the answer has been decided, and a file left behind is a
 * leftover for the media page's storage check, not a reason to fail the request.
 */
export async function discardShopUpload(provider: MediaProviderType, key: string): Promise<void> {
  try {
    await deleteMedia(provider, key)
  } catch (err) {
    console.error(`[shop] could not remove the uploaded file ${key}`, err)
  }
}
