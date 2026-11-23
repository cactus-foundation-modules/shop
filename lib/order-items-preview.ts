// The shape of one line in the orders list's products pop-up, shared by the
// route that serves it (app/api/admin/orders/[id]/items) and the screen that
// draws it. A plain file with no directive, so both sides can import it.
export type OrderItemsPreviewLine = {
  id: string
  productName: string
  productSku: string | null
  quantity: number
  refundedQty: number
  total: string
  isPreOrder: boolean
  options: Array<{ label: string; value: string }>
}

export type OrderItemsPreview = {
  orderNumber: string
  lines: OrderItemsPreviewLine[]
}
