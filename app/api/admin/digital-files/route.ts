import { NextRequest, NextResponse } from 'next/server'
import { errorResponse } from '@/lib/utils'
import { validateNonImageUpload, uploadMedia } from '@/lib/media/upload'
import { getActiveMediaProvider, isMediaProviderConfigured } from '@/lib/config/env'
import { requireShopUser } from '@/modules/shop/lib/access'
import { createDigitalFile } from '@/modules/shop/lib/db/digital'

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
  maxSizeBytes: 200 * 1024 * 1024,
}

export async function POST(request: NextRequest) {
  const gate = await requireShopUser('shop.products')
  if (gate.error) return gate.error

  const provider = await getActiveMediaProvider()
  if (!provider || !isMediaProviderConfigured(provider)) {
    return errorResponse('Media storage is not configured. Select a provider and add its credentials in Settings → Media.', 503)
  }

  const formData = await request.formData()
  const file = formData.get('file') as File | null
  if (!file) return errorResponse('No file provided')

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
