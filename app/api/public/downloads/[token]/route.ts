import { NextResponse } from 'next/server'
import { errorResponse } from '@/lib/utils'
import { getDownloadByToken, getDigitalFileById, incrementDownloadCount } from '@/modules/shop/lib/db/digital'
import { getOrderItemById } from '@/modules/shop/lib/db/orders'
import { getProductById } from '@/modules/shop/lib/db/products'
import { contentDisposition } from '@/modules/shop/lib/download-name'

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

  // Count the download once the bytes have actually gone, not once they have been
  // asked for. A customer gets a limited number of these, and a transfer that
  // died on a train should not cost one of them: flush() runs when the body ends
  // normally, and not at all when the client gives up partway.
  const counted = upstream.body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      async flush() {
        try {
          await incrementDownloadCount(download.id)
        } catch (error) {
          // The bytes are already delivered by this point, so throwing here would
          // only error the tail of a download that succeeded. An uncounted
          // download is the lesser of those two.
          console.error(`[shop] failed to record download ${download.id}:`, error)
        }
      },
    }),
  )

  const headers = new Headers({
    'Content-Type': file.mimeType,
    // The filename is whatever the owner's computer called the file at upload, so
    // it is sanitised rather than interpolated. See lib/download-name.ts.
    'Content-Disposition': contentDisposition(file.filename),
    // These bytes are the site owner's own upload, handed back from the site's own
    // origin. The attachment above is what stops a browser rendering them, and
    // nosniff is what stops it deciding for itself that the stored Content-Type
    // was wrong and rendering them anyway. Braces as well as belt: unlike its
    // sibling, this route's upload allowlist is by declared MIME type rather than
    // by extension, and a declared type is exactly the thing a browser distrusts.
    'X-Content-Type-Options': 'nosniff',
  })
  // The length of the response being relayed, never the size on the stored row.
  // A row disagreeing with the bytes behind it truncates the transfer or leaves
  // the browser waiting for a tail that is never coming. Absent upstream, it is
  // left off and the body goes out chunked, which is slightly worse than a
  // progress bar and considerably better than a corrupt file.
  const length = upstream.headers.get('content-length')
  if (length) headers.set('Content-Length', length)

  return new NextResponse(counted, { headers })
}
