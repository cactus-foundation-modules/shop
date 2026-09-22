import { NextRequest, NextResponse } from 'next/server'
import { errorResponse } from '@/lib/utils'
import { validateUpload, uploadMedia, buildLibraryUploadKey, saveMediaRecord } from '@/lib/media/upload'
import { MAX_UPLOAD_BYTES, MAX_UPLOAD_MB } from '@/lib/media/limits'
import { damagePhotoFolderPath } from '@/modules/shop/lib/order-requests'
import { getOrCreateFolderByPath, resolveFolderPath } from '@/lib/media/organise'
import { getActiveMediaProvider, isMediaProviderConfigured } from '@/lib/config/env'
import { getShopConfigCached } from '@/modules/shop/lib/config'
import { requireOrderAccess } from '@/modules/shop/lib/order-route-access'
import { checkInMemoryRateLimit } from '@/modules/shop/lib/rate-limit'
import { getClientIp } from '@/lib/auth/rate-limit'

// PROTECTED - a photograph for a damage report, uploaded one file at a time by
// somebody who can already see the order (a member, or a guest who has proved
// the delivery postcode - lib/order-route-access.ts).
//
// Uploaded BEFORE the report is submitted rather than in one multipart POST
// with it, because a phone on a bad signal sending four photographs and a form
// together fails as one thing: four uploads that each either land or can be
// retried on their own is the shape that survives a lift. The report then names
// the media rows it wants, and the route below hands back exactly what it needs
// to do that.
//
// Rasters only. validateUpload accepts SVG and sanitises it, which is right for
// an owner uploading a logo and wrong here: a photograph of a broken table leg
// is never a vector, and the narrower the door a guest can push a file through
// the better.
const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp']

// Room for the multipart boundary and headers around the file itself, so a
// photograph right at the limit is not refused for its envelope.
const MULTIPART_OVERHEAD_BYTES = 64 * 1024

const PHOTO_TOO_LARGE = `That photograph is too big - send one under ${MAX_UPLOAD_MB} MB.`

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // Secondary guard only - the access check below is the real one. Tighter than
  // the request endpoint's because this one writes files.
  if (!checkInMemoryRateLimit(`shop_damage_photo:${(await getClientIp())}`, 20, 60_000)) {
    return errorResponse('That is a lot of photographs at once. Give it a minute.', 429)
  }

  const { id } = await params
  const access = await requireOrderAccess(id)
  if (!access.ok) return access.error

  const config = await getShopConfigCached()
  if (!config.damageReportsEnabled) {
    return errorResponse('Get in touch about anything damaged or faulty and we will put it right.', 403)
  }

  const provider = await getActiveMediaProvider()
  if (!provider || !isMediaProviderConfigured(provider)) {
    // Said plainly rather than as a broken upload button: it is the shop's
    // setup that is missing, not the customer's photograph.
    return errorResponse('We cannot take photographs on the website at the moment. Reply to your order email with them instead.', 503)
  }

  // Size first, before a byte is read. The library's own ceiling is checked
  // inside validateUpload, but only once the whole file has been copied into
  // memory - so an oversized upload, on a route a guest can reach with nothing
  // but a postcode, was read in full before being turned away. The declared
  // length stops an honest client before the body is parsed at all (with a
  // little room for the form's own wrapping); the file's own size stops the
  // rest before it is copied.
  const declared = Number(request.headers.get('content-length') ?? NaN)
  if (Number.isFinite(declared) && declared > MAX_UPLOAD_BYTES + MULTIPART_OVERHEAD_BYTES) {
    return errorResponse(PHOTO_TOO_LARGE, 413)
  }

  const formData = await request.formData()
  const file = formData.get('file')
  if (!(file instanceof File)) return errorResponse('No photograph was sent.')

  if (!PHOTO_TYPES.includes(file.type)) {
    return errorResponse('Send a photograph - a JPEG, PNG or WebP.')
  }
  if (file.size > MAX_UPLOAD_BYTES) return errorResponse(PHOTO_TOO_LARGE, 413)

  const buffer = Buffer.from(await file.arrayBuffer())
  const validation = await validateUpload(file.type, buffer.length, buffer)
  if (!validation.valid) return errorResponse(validation.reason)

  try {
    // Filed under Orders / <order number> / issues, so what a customer sent in
    // is browsable in Media beside the order it belongs to rather than a heap
    // only this route can see - the same reasoning the purchase-order portal
    // upload follows (modules/purchase-orders/lib/portal-upload.ts). buildLibraryUploadKey keeps
    // the name the customer's photograph already had, suffixing "-2" and so on
    // only if that exact name is already taken in this order's folder.
    // The same folder the report route checks a photograph is in before it will
    // attach it - see damagePhotoFolderPath.
    const folderId = await getOrCreateFolderByPath(damagePhotoFolderPath(access.order.orderNumber))
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
    // The id is what the report quotes; the url is only so the customer can see
    // the thumbnail they just added. The report resolves the url server-side
    // from the id, so nothing the browser sends here decides what is stored.
    return NextResponse.json({ mediaId: record.id, url: record.url }, { status: 201 })
  } catch (error) {
    console.error('[shop] damage photo upload failed', error)
    return errorResponse('That photograph did not go through. Try again in a moment.', 500)
  }
}
