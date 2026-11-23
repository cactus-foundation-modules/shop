import { NextResponse } from 'next/server'
import { requireShopUser } from '@/modules/shop/lib/access'
import { getOrderById, getOrderItems } from '@/modules/shop/lib/db/orders'
import { getProductMediaForProducts } from '@/modules/shop/lib/db/products'
import type { OrderItemsPreviewLine } from '@/modules/shop/lib/order-items-preview'
import type { ShpProductMedia } from '@/modules/shop/lib/types'

// Just the lines of one order, for the products pop-up on the orders list. The
// order's own GET carries notes, emails, refunds, the customer's history and
// more besides - a dozen reads to answer "what was in it?" from a list row.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireShopUser('shop.orders', { allowAccess: true })
  if (gate.error) return gate.error

  const { id } = await params
  const order = await getOrderById(id)
  if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })

  const items = await getOrderItems(id)
  // The pictures, by the line's own product - the same choice the dispatch and
  // delivery emails make (lib/order-item-email-media.ts), so the owner sees the
  // picture the customer was sent. A failed lookup costs the thumbnails only.
  const productIds = items.map((i) => i.productId).filter((pid): pid is string => !!pid)
  const mediaByProduct = productIds.length > 0
    ? await getProductMediaForProducts(productIds).catch(() => new Map<string, ShpProductMedia[]>())
    : new Map<string, ShpProductMedia[]>()
  const imageFor = (item: (typeof items)[number]): string | null => {
    if (item.lineMeta?.imageUrl) return item.lineMeta.imageUrl
    const media = item.productId ? mediaByProduct.get(item.productId) ?? [] : []
    const image = media.find((m) => m.type === 'IMAGE' && m.isPrimary) ?? media.find((m) => m.type === 'IMAGE')
    return image?.url ?? null
  }
  const lines: OrderItemsPreviewLine[] = items.map((item) => ({
    id: item.id,
    productName: item.productName,
    productSku: item.productSku,
    quantity: item.quantity,
    refundedQty: item.refundedQty,
    total: item.total,
    isPreOrder: item.isPreOrder,
    imageUrl: imageFor(item),
    options: (item.lineMeta?.fields ?? []).map((f) => ({ label: f.label, value: f.value })),
  }))

  return NextResponse.json({ orderNumber: order.orderNumber, lines })
}
