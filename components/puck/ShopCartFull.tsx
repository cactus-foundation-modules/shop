import { CartFullClient, type CartFullOptions } from '@/modules/shop/components/public/CartFullClient'
import {
  cartAccentDefaults, cartAccentFields,
  cartCheckoutDefaults, cartCheckoutFields,
  cartCouponDefaults, cartCouponFields,
  cartEmptyDefaults, cartEmptyFields,
  cartHeadingDefaults, cartHeadingFields,
  cartItemDefaults, cartItemFields,
  cartPanelDefaults, cartPanelFields,
  cartStructureDefaults, cartStructureFields,
  cartTotalsDefaults, cartTotalsFields,
  cartUndoDefaults, cartUndoFields,
} from '@/modules/shop/components/puck/cart-fields'

// Full, configurable cart-display block: the basket lines AND the totals in one
// piece. A page that wants something of its own between the two uses the split
// pair instead (ShopCartItems + ShopCartTotals) - same island, same options,
// same markup, just the halves separately droppable.
//
// The cart itself lives in localStorage, so the widget is the CartFullClient
// island; this block wires ~30 look/behaviour options into it as plain props
// (the field definitions are shared with the split blocks - see cart-fields).
// Editor render seeds sample lines (preview); the RSC render is a SERVER
// component that passes only plain props across the boundary (Puck's <Render>
// chokes on the renderDropZone bag - same trick as ShopCartSummary), and the
// island fetches the live cart client-side.

export type ShopCartFullProps = CartFullOptions

export function ShopCartFull(props: ShopCartFullProps) {
  return <CartFullClient {...props} preview />
}

export const shopCartFullPuckComponent = {
  label: 'Shop: Cart',
  fields: {
    ...cartStructureFields,
    ...cartHeadingFields,
    ...cartItemFields,
    ...cartCouponFields,
    ...cartTotalsFields,
    ...cartUndoFields,
    ...cartCheckoutFields,
    ...cartEmptyFields,
    ...cartAccentFields,
    ...cartPanelFields,
  },
  defaultProps: {
    ...cartStructureDefaults,
    ...cartHeadingDefaults,
    ...cartItemDefaults,
    ...cartCouponDefaults,
    ...cartTotalsDefaults,
    ...cartUndoDefaults,
    ...cartCheckoutDefaults,
    ...cartEmptyDefaults,
    ...cartAccentDefaults,
    ...cartPanelDefaults,
  } as ShopCartFullProps,
  render: ShopCartFull,
}

// RSC half: server wrapper renders the client island with live props (no preview).
// Puck's RSC <Render> hands every block a `puck` bag (renderDropZone, dragRef,
// metadata, isEditing - all live functions) alongside its own props. Spreading
// that straight into the client island trips React's "Functions cannot be passed
// directly to Client Components" and 500s the whole cart page (digest 3816856056).
// Forward only the block's own plain options - same discipline ShopUpsellProducts
// already keeps by hand-picking its props.
export function ShopCartFullRsc(props: ShopCartFullProps) {
  const options = { ...props } as Record<string, unknown>
  delete options.puck
  delete options.editMode
  return <CartFullClient {...(options as ShopCartFullProps)} />
}

export const shopCartFullPuckRscComponent = {
  ...shopCartFullPuckComponent,
  render: ShopCartFullRsc,
}
