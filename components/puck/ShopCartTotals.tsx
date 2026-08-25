import { CartFullClient, type CartFullOptions } from '@/modules/shop/components/public/CartFullClient'
import {
  cartAccentDefaults, cartAccentFields,
  cartCheckoutDefaults, cartCheckoutFields,
  cartCouponDefaults, cartCouponFields,
  cartHeadingDefaults, cartHeadingFields,
  cartNoteFields,
  cartTotalsDefaults, cartTotalsFields,
  cartWidthDefaults, cartWidthFields,
} from '@/modules/shop/components/puck/cart-fields'
import { CART_PAGE_NOTE_DEFAULTS } from '@/modules/shop/components/public/cart-note-options'

// The money end of the basket on its own - the bottom half of Shop: Cart: the
// coupon field, the item count, the Subtotal / charges / tax / Total table, the
// checkout button and the sticky bar. Pair it with Shop: Cart items above it.
//
// Same island as the whole-cart block, told to render only its footer, so it
// works out the totals from the same validated basket the lines came from rather
// than from a second sum that could disagree with them. An empty basket renders
// nothing here - the items block says so once, and a checkout button with
// nothing behind it is worse than no button.

export type ShopCartTotalsProps = CartFullOptions

export function ShopCartTotals(props: ShopCartTotalsProps) {
  return <CartFullClient {...props} section="totals" preview />
}

export const shopCartTotalsPuckComponent = {
  label: 'Shop: Cart totals',
  fields: {
    ...cartWidthFields,
    ...cartHeadingFields,
    ...cartCouponFields,
    ...cartTotalsFields,
    ...cartCheckoutFields,
    ...cartAccentFields,
    ...cartNoteFields(),
  },
  defaultProps: {
    ...cartWidthDefaults,
    ...cartHeadingDefaults,
    ...cartCouponDefaults,
    ...cartTotalsDefaults,
    ...cartCheckoutDefaults,
    ...cartAccentDefaults,
    ...CART_PAGE_NOTE_DEFAULTS,
  } as ShopCartTotalsProps,
  render: ShopCartTotals,
}

// RSC half: plain props only across the boundary - see ShopCartFullRsc.
export function ShopCartTotalsRsc(props: ShopCartTotalsProps) {
  const options = { ...props } as Record<string, unknown>
  delete options.puck
  delete options.editMode
  return <CartFullClient {...(options as ShopCartTotalsProps)} section="totals" />
}

export const shopCartTotalsPuckRscComponent = {
  ...shopCartTotalsPuckComponent,
  render: ShopCartTotalsRsc,
}
