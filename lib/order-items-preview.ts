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
  /** The line's own picture if it was sold under one, else its product's
   *  primary image - the rule the order emails use. Null when it has none. */
  imageUrl: string | null
  options: Array<{ label: string; value: string }>
}

export type OrderItemsPreview = {
  orderNumber: string
  lines: OrderItemsPreviewLine[]
}
