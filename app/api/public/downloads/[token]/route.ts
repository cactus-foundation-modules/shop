import { NextResponse } from 'next/server'
import { errorResponse } from '@/lib/utils'
import { getDownloadByToken, getDigitalFileById, releaseDownloadSlot, reserveDownloadSlot } from '@/modules/shop/lib/db/digital'
import { getOrderById, getOrderItemById } from '@/modules/shop/lib/db/orders'
import { getProductById } from '@/modules/shop/lib/db/products'
import { contentDisposition } from '@/modules/shop/lib/download-name'
import { DOWNLOAD_LIMIT_REACHED, downloadRefusal } from '@/modules/shop/lib/download-access'

// PROTECTED - access control: token lookup, expiry, the order still being paid
// for and not refunded, and the download limit, all before a byte is handed
// over (spec 8.1 GET /downloads/[token]). The rule itself is
// lib/download-access.ts, shared with the page this route sits behind.
//
// Deliberately NOT behind the shop gate: a file somebody has paid for is theirs
// to download whether or not the shop is open to new orders (see getShopGate
// in lib/access.ts). Every check above still stands.
export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const download = await getDownloadByToken(token)
  if (!download) return errorResponse('This download link is not valid.', 404)

  const [order, orderItem] = await Promise.all([getOrderById(download.orderId), getOrderItemById(download.orderItemId)])
  const product = orderItem?.productId ? await getProductById(orderItem.productId) : null
  const downloadLimit = product?.downloadLimit ?? null
  const refusal = downloadRefusal({ download, order, item: orderItem, downloadLimit })
  if (refusal) return errorResponse(refusal.message, refusal.status)

  const file = await getDigitalFileById(download.fileId)
  if (!file) return errorResponse('File not found.', 404)

  // A HEAD asks what the file is without taking it, and the platform answers one
  // by running this handler and throwing the body away unread - so the stream
  // below never finishes and never cancels, and a reserved slot would be spent
  // on nothing. A download manager or a link checker probing the link three
  // times used up a limit of three before the customer had the file once.
  if (request.method === 'HEAD') {
    return new NextResponse(null, {
      headers: {
        'Content-Type': file.mimeType,
        'Content-Disposition': contentDisposition(file.filename),
        'X-Content-Type-Options': 'nosniff',
      },
    })
  }

  // The download is taken BEFORE the file is fetched, in one conditional UPDATE,
  // because the check above is only a read: five tabs opened at once on the last
  // download all pass it together. Whichever reaches the row second finds the
  // slot already gone. See reserveDownloadSlot.
  if (!(await reserveDownloadSlot(download.id, downloadLimit))) {
    return errorResponse(DOWNLOAD_LIMIT_REACHED, 410)
  }

  // Taken up front, but still only KEPT once the bytes have actually gone. A
  // customer gets a limited number of these, and a transfer that died on a train
  // should not cost one of them - so every way a transfer can fail to finish
  // hands the slot back, exactly once.
  let settled = false
  const giveBack = async () => {
    if (settled) return
    settled = true
    try {
      await releaseDownloadSlot(download.id)
    } catch (error) {
      // Lost a slot the customer should have kept. Worth a log line and not
      // worth failing anything else over: the transfer has already gone wrong.
      console.error(`[shop] failed to hand back download ${download.id}:`, error)
    }
  }

  // Stream the bytes through this gated endpoint rather than redirecting -
  // a redirect hands the browser the permanent underlying file URL, which
  // can then be reused directly to bypass the expiry/limit checks above.
  let upstream: Response
  try {
    upstream = await fetch(file.url)
  } catch (error) {
    console.error(`[shop] could not fetch the file behind download ${download.id}:`, error)
    await giveBack()
    return errorResponse('The file could not be retrieved.', 502)
  }
  if (!upstream.ok || !upstream.body) {
    await giveBack()
    return errorResponse('The file could not be retrieved.', 502)
  }

  // Relayed by hand rather than piped through a TransformStream, because the
  // case that matters is the customer giving up partway - and a transform has no
  // dependable hook for that. A ReadableStream's cancel() is called when the
  // response is abandoned, and an error from the storage side lands in pull().
  // Reaching the end is the one outcome that keeps the slot.
  const reader = upstream.body.getReader()
  const counted = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { done, value } = await reader.read()
        if (done) {
          settled = true
          controller.close()
          return
        }
        controller.enqueue(value)
      } catch (error) {
        await giveBack()
        controller.error(error)
      }
    },
    async cancel(reason) {
      await giveBack()
      await reader.cancel(reason).catch(() => undefined)
    },
  })

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
