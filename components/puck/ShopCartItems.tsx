import { CartFullClient, type CartFullOptions } from '@/modules/shop/components/public/CartFullClient'
import {
  cartAccentDefaults, cartAccentFields,
  cartEmptyDefaults, cartEmptyFields,
  cartHeadingDefaults, cartHeadingFields,
  cartItemDefaults, cartItemFields,
  cartPanelDefaults, cartPanelFields,
  cartStructureDefaults, cartStructureFields,
  cartUndoDefaults, cartUndoFields,
} from '@/modules/shop/components/puck/cart-fields'

// The basket lines on their own - the top half of Shop: Cart. Pair it with
// Shop: Cart totals and anything else the page wants in between (a delivery
// arrivals panel, a message about lead times) sits between the two rather than
// having to go above the lines or below the checkout button.
//
// Same island as the whole-cart block, told to render only its item list, so
// the two blocks cannot drift apart. It carries the empty-basket message and the
// undo toast, since both belong with the lines.

export type ShopCartItemsProps = CartFullOptions

export function ShopCartItems(props: ShopCartItemsProps) {
  return <CartFullClient {...props} section="items" preview />
}

export const shopCartItemsPuckComponent = {
  label: 'Shop: Cart items',
  fields: {
    ...cartStructureFields,
    ...cartHeadingFields,
    ...cartItemFields,
    ...cartUndoFields,
    ...cartEmptyFields,
    ...cartAccentFields,
    ...cartPanelFields,
  },
  defaultProps: {
    ...cartStructureDefaults,
    ...cartHeadingDefaults,
    ...cartItemDefaults,
    ...cartUndoDefaults,
    ...cartEmptyDefaults,
    ...cartAccentDefaults,
    ...cartPanelDefaults,
  } as ShopCartItemsProps,
  render: ShopCartItems,
}

// RSC half: a server wrapper that hands the island plain props only. Puck's RSC
// <Render> passes every block a `puck` bag of live functions alongside its own
// props, and spreading that into a client island 500s the page - see the note on
// ShopCartFullRsc.
export function ShopCartItemsRsc(props: ShopCartItemsProps) {
  const options = { ...props } as Record<string, unknown>
  delete options.puck
  delete options.editMode
  return <CartFullClient {...(options as ShopCartItemsProps)} section="items" />
}

export const shopCartItemsPuckRscComponent = {
  ...shopCartItemsPuckComponent,
  render: ShopCartItemsRsc,
}
