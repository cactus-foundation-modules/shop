import { NextRequest, NextResponse } from 'next/server'
import { errorResponse } from '@/lib/utils'
import { validateUpload, uploadMedia, saveMediaRecord } from '@/lib/media/upload'
import { getActiveMediaProvider, isMediaProviderConfigured } from '@/lib/config/env'
import { getShopConfigCached } from '@/modules/shop/lib/config'
import { requireOrderAccess } from '@/modules/shop/lib/order-route-access'
import { checkInMemoryRateLimit, getClientIpFromRequest } from '@/modules/shop/lib/rate-limit'

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

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // Secondary guard only - the access check below is the real one. Tighter than
  // the request endpoint's because this one writes files.
  if (!checkInMemoryRateLimit(`shop_damage_photo:${getClientIpFromRequest(request)}`, 20, 60_000)) {
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

  const formData = await request.formData()
  const file = formData.get('file')
  if (!(file instanceof File)) return errorResponse('No photograph was sent.')

  if (!PHOTO_TYPES.includes(file.type)) {
    return errorResponse('Send a photograph - a JPEG, PNG or WebP.')
  }

  const buffer = Buffer.from(await file.arrayBuffer())
  const validation = await validateUpload(file.type, buffer.length, buffer)
  if (!validation.valid) return errorResponse(validation.reason)

  try {
    const result = await uploadMedia(validation.buffer, file.type, provider, file.name, 'shop/damage-reports')
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
