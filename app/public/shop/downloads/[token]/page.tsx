import { getDownloadByToken } from '@/modules/shop/lib/db/digital'
import { getOrderItemById } from '@/modules/shop/lib/db/orders'
import { getProductById } from '@/modules/shop/lib/db/products'

export const metadata = { title: 'Download' }

// Friendly wrapper around GET /api/m/shop/public/downloads/[token] (spec
// 13) - the API route itself streams/redirects to the file and increments
// the count; this page just explains expiry/limit states nicely first.
export default async function ShopDownloadPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const download = await getDownloadByToken(token)

  if (!download) {
    return <Message text="This download link is not valid." />
  }
  if (download.expiresAt && download.expiresAt < new Date()) {
    return <Message text="This download link has expired." />
  }

  const orderItem = await getOrderItemById(download.orderItemId)
  const product = orderItem?.productId ? await getProductById(orderItem.productId) : null
  if (product?.downloadLimit != null && download.downloadCount >= product.downloadLimit) {
    return <Message text="This download link has reached its download limit." />
  }

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', padding: '4rem 1.5rem', textAlign: 'center' }}>
      <p>Your file is ready.</p>
      <a
        href={`/api/m/shop/public/downloads/${token}`}
        style={{ display: 'inline-block', marginTop: '1rem', background: 'var(--color-primary)', color: 'var(--color-primary-contrast, #fff)', borderRadius: 8, padding: '0.75rem 1.5rem', fontWeight: 600, textDecoration: 'none' }}
      >
        Download now
      </a>
    </div>
  )
}

function Message({ text }: { text: string }) {
  return <div style={{ maxWidth: 480, margin: '0 auto', padding: '4rem 1.5rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>{text}</div>
}
