import { getDownloadByToken } from '@/modules/shop/lib/db/digital'
import { getOrderById, getOrderItemById } from '@/modules/shop/lib/db/orders'
import { getProductById } from '@/modules/shop/lib/db/products'
import { downloadRefusal } from '@/modules/shop/lib/download-access'

export const metadata = { title: 'Download' }

// Friendly wrapper around GET /api/m/shop/public/downloads/[token] (spec
// 13) - the API route itself streams the file and counts the download; this
// page explains, nicely and first, why a link will not work. The same rule as
// the route (lib/download-access.ts), so the page never offers a button the
// route will then refuse.
export default async function ShopDownloadPage({ params }: { params: Promise<{ token: string }> }) {
  // Deliberately NOT behind the shop gate, like the route it wraps: a file
  // somebody has paid for stays theirs while the shop is closed (see
  // getShopGate in lib/access.ts).
  const { token } = await params
  const download = await getDownloadByToken(token)

  if (!download) {
    return <Message text="This download link is not valid." />
  }

  const [order, orderItem] = await Promise.all([getOrderById(download.orderId), getOrderItemById(download.orderItemId)])
  const product = orderItem?.productId ? await getProductById(orderItem.productId) : null
  const refusal = downloadRefusal({ download, order, item: orderItem, downloadLimit: product?.downloadLimit ?? null })
  if (refusal) {
    return <Message text={refusal.message} />
  }

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', padding: '4rem 1.5rem', textAlign: 'center' }}>
      <p>Your file is ready.</p>
      <a
        href={`/api/m/shop/public/downloads/${token}`}
        style={{ display: 'inline-block', marginTop: '1rem', background: 'var(--color-primary)', color: 'var(--color-on-primary)', borderRadius: 8, padding: '0.75rem 1.5rem', fontWeight: 600, textDecoration: 'none' }}
      >
        Download now
      </a>
    </div>
  )
}

function Message({ text }: { text: string }) {
  return <div style={{ maxWidth: 480, margin: '0 auto', padding: '4rem 1.5rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>{text}</div>
}
