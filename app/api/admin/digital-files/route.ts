import { NextRequest, NextResponse } from 'next/server'
import type { MediaProviderType } from '@prisma/client'
import { z } from 'zod'
import { errorResponse } from '@/lib/utils'
import { validateNonImageUpload, uploadMedia } from '@/lib/media/upload'
import { MAX_UPLOAD_BYTES, tooLargeReason } from '@/lib/media/limits'
import { getActiveMediaProvider, isMediaProviderConfigured } from '@/lib/config/env'
import { requireShopUser } from '@/modules/shop/lib/access'
import { createDigitalFile } from '@/modules/shop/lib/db/digital'
import { DIGITAL_FILE_MAX_BYTES, DIGITAL_FILE_MAX_MB } from '@/modules/shop/lib/direct-upload'
import { checkLandedUpload, discardShopUpload, issueShopUploadTicket } from '@/modules/shop/lib/direct-upload-server'

// Digital product file uploads (spec Q5) - reuses core's generic
// validateNonImageUpload/uploadMedia (lib/media/upload.ts), not the
// image-only /api/admin/media endpoint. The spec doesn't restrict what a
// digital product can be, so this allows the common download formats
// rather than an unbounded any-file-type mode.
const MODE = {
  allowedMimeTypes: [
    'application/pdf', 'application/zip', 'application/x-zip-compressed', 'application/epub+zip',
    'application/vnd.ms-excel', 'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain', 'text/csv',
    'audio/mpeg', 'audio/wav', 'video/mp4',
  ],
  // Core's ceiling for anything that comes through a function, not the 200 MB
  // this used to claim. The hosting platform refuses a request body over 4.5 MB
  // before this route ever runs, so no file above that could arrive whatever
  // this said - it just failed with a bare error page that the product editor
  // could only report as "try again". Saying the real number lets the route and
  // the editor refuse it up front, in words.
  maxSizeBytes: MAX_UPLOAD_BYTES,
}

// The same types, for a file that goes straight to storage instead of through
// this function - which is how anything over the form ceiling travels now (see
// lib/direct-upload.ts). Only the ceiling differs.
const DIRECT_MODE = { ...MODE, maxSizeBytes: DIGITAL_FILE_MAX_BYTES }

// A name as the owner's computer gave it. Kept whole for the row (the download
// arrives under it, tidied by lib/download-name.ts); bounded so a request cannot
// hand the database a novel.
const Filename = z.string().trim().min(1).max(255)
// The browser's own claim about the file's type, checked against DIRECT_MODE's
// list exactly as the form path checks file.type. Empty when the browser has no
// idea, which the list then refuses, as it always has.
const DeclaredType = z.string().max(255)

const DirectBody = z.discriminatedUnion('action', [
  // Before the bytes move: may this file go up at all, and if so, where to.
  z.object({ action: z.literal('prepare'), filename: Filename, type: DeclaredType, sizeBytes: z.number().int().positive() }),
  // After they have: the key and token the prepare step handed out. No size and
  // no url - those come from storage and from the key respectively.
  z.object({ action: z.literal('record'), filename: Filename, type: DeclaredType, key: z.string().min(1).max(1024), token: z.string().min(1).max(512) }),
])

export async function POST(request: NextRequest) {
  const gate = await requireShopUser('shop.products')
  if (gate.error) return gate.error

  const provider = await getActiveMediaProvider()
  if (!provider || !isMediaProviderConfigured(provider)) {
    return errorResponse('Media storage is not configured. Select a provider and add its credentials in Settings → Media.', 503)
  }

  // A JSON body is the direct path: the file itself is going, or has gone,
  // straight to storage. A form is the original upload, unchanged below.
  if (request.headers.get('content-type')?.startsWith('application/json')) {
    return handleDirectUpload(request, provider)
  }

  const formData = await request.formData()
  const file = formData.get('file') as File | null
  if (!file) return errorResponse('No file provided')
  // Refused on its declared size, before a second copy of it is made in memory.
  if (file.size > MODE.maxSizeBytes) return errorResponse(tooLargeReason(file.size), 413)

  const buffer = Buffer.from(await file.arrayBuffer())
  const validation = await validateNonImageUpload(file.type || 'application/octet-stream', buffer.length, MODE)
  if (!validation.valid) return errorResponse(validation.reason)

  try {
    const result = await uploadMedia(buffer, file.type || 'application/octet-stream', provider, file.name)
    const record = await createDigitalFile({ filename: file.name, url: result.url, size: result.sizeBytes, mimeType: result.mimeType })
    return NextResponse.json(record, { status: 201 })
  } catch (err) {
    return errorResponse(`Upload failed: ${err instanceof Error ? err.message : 'Unknown error'}`, 500)
  }
}

// A file too big for the form, in two calls either side of the browser's own
// PUT to storage. The row it ends with is the same shape the form path writes -
// name, the url the download route fetches, size and type - so a buyer's link
// cannot tell which way the file came.
async function handleDirectUpload(request: NextRequest, provider: MediaProviderType): Promise<Response> {
  const parsed = DirectBody.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return errorResponse('That upload request was not recognised.', 400)
  const body = parsed.data
  const mimeType = body.type || 'application/octet-stream'

  if (body.action === 'prepare') {
    // Everything that can be refused is refused now, before the owner waits for
    // fifty megabytes to cross the wire only to be told the type was wrong.
    if (body.sizeBytes > DIGITAL_FILE_MAX_BYTES) {
      return errorResponse(`"${body.filename}": ${tooLargeReason(body.sizeBytes, DIGITAL_FILE_MAX_MB)}`, 413)
    }
    const validation = await validateNonImageUpload(mimeType, body.sizeBytes, DIRECT_MODE)
    if (!validation.valid) return errorResponse(validation.reason)
    return NextResponse.json(issueShopUploadTicket(provider, 'downloads', body.filename))
  }

  const landed = await checkLandedUpload({
    provider,
    purpose: 'downloads',
    filename: body.filename,
    key: body.key,
    token: body.token,
    maxBytes: DIGITAL_FILE_MAX_BYTES,
  })
  if (!landed.ok) return errorResponse(landed.error, landed.status)

  // Asked again, of the size storage reports rather than the one declared up
  // front. A refusal here removes the object: nothing will ever point at it.
  const validation = await validateNonImageUpload(mimeType, landed.sizeBytes, DIRECT_MODE)
  if (!validation.valid) {
    await discardShopUpload(provider, landed.key)
    return errorResponse(validation.reason)
  }

  try {
    const record = await createDigitalFile({ filename: body.filename, url: landed.url, size: landed.sizeBytes, mimeType })
    return NextResponse.json(record, { status: 201 })
  } catch (err) {
    return errorResponse(`Upload failed: ${err instanceof Error ? err.message : 'Unknown error'}`, 500)
  }
}
