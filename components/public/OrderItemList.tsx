import Link from 'next/link'
import type { MemberOrderLine } from '@/modules/shop/lib/member-orders'
import { effectiveGroup, sortLinesByGroup } from '@/modules/shop/lib/cart-group'
import { formatMoney } from '@/modules/shop/lib/money'
import { formatOrderDate } from '@/modules/shop/lib/order-display'
import { productHref, type ProductUrlStyle } from '@/modules/shop/lib/product-url'
import BuyAgainButton from '@/modules/shop/components/public/BuyAgainButton'
import { Icon, ICON_IMAGE } from '@/modules/shop/components/public/OrderDetailChrome'

// What was bought, laid out the way the confirmation page lays it out - because
// it is the same order and the same list, and a customer comparing the email in
// their inbox with the page in front of them should not have to work out that
// they match.
//
// Three things changed in the move off the old flat list:
//
//  - Grouped lines sit together. A desk and the drawer unit bought with it were
//    already stored as a group and already shown as one everywhere else; this
//    page was the last surface still printing them as two unrelated lines in
//    basket order.
//  - The unit price is shown where there is more than one of something. "£240"
//    against a line of four was arithmetic the reader had to do.
//  - State and action stopped sharing a row. "Dispatched" and "Buy again" were
//    two pills of equal weight side by side; one is a fact and the other is a
//    button, and they now sit at opposite ends of the row.

type Props = {
  lines: MemberOrderLine[]
  currencySymbol: string
  productUrlStyle: ProductUrlStyle
  buyAgainEnabled: boolean
  timezone: string
}

export function OrderItemList({ lines, currencySymbol, productUrlStyle, buyAgainEnabled, timezone }: Props) {
  const entries = sortLinesByGroup(
    lines.map((line) => ({ line, group: line.item.lineMeta?.group ?? null })),
  )

  return (
    <ul className="sod-items">
      {entries.map((entry) => {
        const { line } = entry
        const { item } = line
        const group = effectiveGroup(entry, entries)
        const quantity = item.quantity

        return (
          <li key={item.id} className="sod-item">
            {line.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- storage-served product image, not a local asset next/image can optimise
              <img className="sod-thumb" src={line.imageUrl} alt="" width={56} height={56} />
            ) : (
              <div className="sod-thumb sod-thumb-empty" aria-hidden="true"><Icon>{ICON_IMAGE}</Icon></div>
            )}

            <p className="sod-item-name">
              {group?.role === 'attachment' && group.caption && (
                <span className="sod-item-groupcap"><span aria-hidden="true">↳ </span>{group.caption}<br /></span>
              )}
              {line.productSlug ? (
                <Link href={productHref(line.productSlug, productUrlStyle)} prefetch={false}>
                  {item.productName}
                </Link>
              ) : (
                item.productName
              )}
            </p>

            <span className="sod-item-price">{formatMoney(item.total, currencySymbol)}</span>

            {/* Unit price only where it tells you something the line total does
                not already: on one of a thing, "£40 × 1" is noise. */}
            <p className="sod-item-qty">
              {quantity > 1 ? `${formatMoney(item.unitPrice, currencySymbol)} × ${quantity}` : 'Qty 1'}
            </p>

            {item.lineMeta?.fields?.length ? (
              <ul className="sod-item-meta">
                {item.lineMeta.fields.map((field, i) => (
                  <li key={i}>
                    <span>{field.label}:</span>{' '}
                    {field.href ? (
                      <a href={field.href} target="_blank" rel="noopener noreferrer">{field.value}</a>
                    ) : (
                      field.value
                    )}
                  </li>
                ))}
              </ul>
            ) : null}

            <div className="sod-item-foot">
              {line.dispatchedQty > 0 && (
                <span className="badge badge-success">
                  {line.dispatchedQty >= quantity ? 'Dispatched' : `${line.dispatchedQty} of ${quantity} dispatched`}
                </span>
              )}
              {item.refundedQty > 0 && <span className="badge badge-warning">{item.refundedQty} refunded</span>}
              {item.isPreOrder && (
                <span className="badge badge-info">
                  Pre-order{item.preOrderDispatchDate ? ` · expected ${formatOrderDate(item.preOrderDispatchDate, timezone)}` : ''}
                </span>
              )}
              {buyAgainEnabled && (
                <>
                  <span className="sod-spacer" />
                  <BuyAgainButton
                    productId={item.productId}
                    productSlug={line.productSlug}
                    quantity={quantity}
                    personalised={!!item.lineMeta?.fields?.length}
                    productUrlStyle={productUrlStyle}
                  />
                </>
              )}
            </div>
          </li>
        )
      })}
    </ul>
  )
}
