import { prisma } from '@/lib/db/prisma'
import { validateUpload, uploadMedia, buildLibraryUploadKey, saveMediaRecord } from '@/lib/media/upload'
import { MAX_UPLOAD_BYTES, MAX_UPLOAD_MB } from '@/lib/media/limits'
import { findFolderByPath, getOrCreateFolderByPath, resolveFolderPath } from '@/lib/media/organise'
import { getActiveMediaProvider, isMediaProviderConfigured } from '@/lib/config/env'
import { damagePhotoFolderPath } from '@/modules/shop/lib/order-requests'

// Photographs on an issue report: taking one in, and checking the ones a report
// names are really this order's.
//
// Three doors lead here - the customer's report form, the customer answering a
// request for photographs, and staff adding one from the queue - and all three
// file into the same folder, so the folder check that stops one customer's
// photograph being hung off another's order holds for every one of them.

// Rasters only. validateUpload accepts SVG and sanitises it, which is right for
// an owner uploading a logo and wrong here: a photograph of a broken table leg
// is never a vector, and the narrower the door a guest can push a file through
// the better.
const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp']

// Room for the multipart boundary and headers around the file itself, so a
// photograph right at the limit is not refused for its envelope.
const MULTIPART_OVERHEAD_BYTES = 64 * 1024

const PHOTO_TOO_LARGE = `That photograph is too big - send one under ${MAX_UPLOAD_MB} MB.`

export type ReceivedPhoto =
  | { ok: true; mediaId: string; url: string }
  | { ok: false; status: number; error: string }

/**
 * Takes one photograph off a multipart request and files it under the order's
 * issues folder in the media library.
 *
 * Size first, before a byte is read. The library's own ceiling is checked inside
 * validateUpload, but only once the whole file has been copied into memory - so
 * an oversized upload, on a route a guest can reach with nothing but a postcode,
 * would be read in full before being turned away. The declared length stops an
 * honest client before the body is parsed at all; the file's own size stops the
 * rest before it is copied.
 */
export async function receiveIssuePhoto(request: Request, orderNumber: string): Promise<ReceivedPhoto> {
  const provider = await getActiveMediaProvider()
  if (!provider || !isMediaProviderConfigured(provider)) {
    // Said plainly rather than as a broken upload button: it is the shop's
    // setup that is missing, not the photograph.
    return { ok: false, status: 503, error: 'We cannot take photographs on the website at the moment. Reply to your order email with them instead.' }
  }

  const declared = Number(request.headers.get('content-length') ?? NaN)
  if (Number.isFinite(declared) && declared > MAX_UPLOAD_BYTES + MULTIPART_OVERHEAD_BYTES) {
    return { ok: false, status: 413, error: PHOTO_TOO_LARGE }
  }

  const formData = await request.formData()
  const file = formData.get('file')
  if (!(file instanceof File)) return { ok: false, status: 400, error: 'No photograph was sent.' }
  if (!PHOTO_TYPES.includes(file.type)) return { ok: false, status: 400, error: 'Send a photograph - a JPEG, PNG or WebP.' }
  if (file.size > MAX_UPLOAD_BYTES) return { ok: false, status: 413, error: PHOTO_TOO_LARGE }

  const buffer = Buffer.from(await file.arrayBuffer())
  const validation = await validateUpload(file.type, buffer.length, buffer)
  if (!validation.valid) return { ok: false, status: 400, error: validation.reason }

  try {
    // Filed under Orders / <order number> / issues, so what was sent in is
    // browsable in Media beside the order it belongs to rather than a heap only
    // these routes can see - the same reasoning the purchase-order portal upload
    // follows (modules/purchase-orders/lib/portal-upload.ts). buildLibraryUploadKey
    // keeps the photograph's own name, suffixing "-2" and so on only if that
    // exact name is already taken in this order's folder.
    const folderId = await getOrCreateFolderByPath(damagePhotoFolderPath(orderNumber))
    const folderPath = folderId ? await resolveFolderPath(folderId) : undefined
    const presetKey = await buildLibraryUploadKey(provider, file.type, file.name, folderPath)
    const result = await uploadMedia(validation.buffer, file.type, provider, file.name, folderPath, false, presetKey)
    const record = await saveMediaRecord({
      key: result.key,
      url: result.url,
      provider,
      mimeType: result.mimeType,
      sizeBytes: result.sizeBytes,
      originalName: file.name,
      // Nothing here is ever rendered on a public page, so there is no alt text
      // to chase - the library's own audit should not spend the rest of its life
      // asking the owner to describe somebody else's broken table.
      isDecorative: true,
      folderId,
    })
    return { ok: true, mediaId: record.id, url: record.url }
  } catch (error) {
    console.error('[shop] issue photo upload failed', error)
    return { ok: false, status: 500, error: 'That photograph did not go through. Try again in a moment.' }
  }
}

/**
 * The library rows behind a list of media ids, kept only where each is an image
 * filed in THIS order's issues folder - which is where every upload above puts
 * it. A media id is a global handle: without the folder, anybody who could see
 * one order could hang another customer's photograph - or a staff upload, or the
 * catalogue - off it, and the owner's queue would open it full size. Looked up
 * rather than created, so ids quoted on an order nobody has uploaded to find no
 * folder and come back empty. Ids that name nothing are dropped quietly: a
 * photograph that failed to save should not lose the report it belongs to.
 */
export async function resolveIssuePhotos(
  orderNumber: string,
  ids: ReadonlyArray<string>,
): Promise<Array<{ mediaId: string; url: string }>> {
  if (ids.length === 0) return []
  const folderId = await findFolderByPath(damagePhotoFolderPath(orderNumber))
  if (!folderId) return []
  const media = await prisma.media.findMany({
    where: { id: { in: [...ids] }, folderId, mimeType: { startsWith: 'image/' } },
    select: { id: true, url: true },
  })
  return media.map((row) => ({ mediaId: row.id, url: row.url }))
}
