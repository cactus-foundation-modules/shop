import { NextResponse } from 'next/server'
import { errorResponse } from '@/lib/utils'
import { getDownloadByToken, getDigitalFileById, incrementDownloadCount } from '@/modules/shop/lib/db/digital'
import { getOrderItemById } from '@/modules/shop/lib/db/orders'
import { getProductById } from '@/modules/shop/lib/db/products'

// PROTECTED - access control: token lookup, expiry + download-limit checks
// before ever handing back a URL (spec 8.1 GET /downloads/[token]).
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const download = await getDownloadByToken(token)
  if (!download) return errorResponse('This download link is not valid.', 404)
  if (download.expiresAt && download.expiresAt < new Date()) return errorResponse('This download link has expired.', 410)

  const orderItem = await getOrderItemById(download.orderItemId)
  const product = orderItem?.productId ? await getProductById(orderItem.productId) : null
  if (product?.downloadLimit != null && download.downloadCount >= product.downloadLimit) {
    return errorResponse('This download link has reached its download limit.', 410)
  }

  const file = await getDigitalFileById(download.fileId)
  if (!file) return errorResponse('File not found.', 404)

  // Stream the bytes through this gated endpoint rather than redirecting -
  // a redirect hands the browser the permanent underlying file URL, which
  // can then be reused directly to bypass the expiry/limit checks above.
  const upstream = await fetch(file.url)
  if (!upstream.ok || !upstream.body) return errorResponse('The file could not be retrieved.', 502)

  await incrementDownloadCount(download.id)
  return new NextResponse(upstream.body, {
    headers: {
      'Content-Type': file.mimeType,
      'Content-Disposition': `attachment; filename="${file.filename}"`,
      'Content-Length': String(file.size),
    },
  })
}
