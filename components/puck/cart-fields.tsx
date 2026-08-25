import { SiteColourField } from '@/lib/puck/SiteColourField'
import type { CartFullOptions } from '@/modules/shop/components/public/CartFullClient'

// Shared field groups for the cart blocks. The whole cart (Shop: Cart) and the
// two split blocks (Shop: Cart items / Shop: Cart totals) offer overlapping
// subsets of the same options, so the field definitions and their defaults live
// here once - a new option is added in one place and every block that shows the
// thing it controls picks it up.

export const yesNo = [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }]

// Puck prints no label above a custom field, so the swatch grid carries its own
// or the author is left guessing which row is which.
export const colourField = (label: string) => ({
  type: 'custom' as const,
  label,
  render: ({ value, onChange, field }: { value: string; onChange: (v: string) => void; field: { label?: string } }) => (
    <SiteColourField value={value} onChange={onChange} label={field?.label ?? label} />
  ),
})

// A block that only prints the totals still wants its own width, so the width
// field is its own group rather than part of the list's structure.
export const cartWidthFields = {
  maxWidth: { type: 'number' as const, label: 'Max width (px, 0 = full)' },
}
export const cartWidthDefaults = { maxWidth: 640 }

export const cartStructureFields = {
  layoutStyle: { type: 'select' as const, label: 'Layout style', options: [{ value: 'rows', label: 'Rows' }, { value: 'cards', label: 'Cards' }, { value: 'table', label: 'Table' }] },
  ...cartWidthFields,
  density: { type: 'select' as const, label: 'Spacing', options: [{ value: 'compact', label: 'Compact' }, { value: 'cosy', label: 'Cosy' }, { value: 'roomy', label: 'Roomy' }] },
  dividers: { type: 'select' as const, label: 'Row dividers', options: [{ value: 'line', label: 'Line' }, { value: 'none', label: 'None' }] },
}
export const cartStructureDefaults = { layoutStyle: 'rows', ...cartWidthDefaults, density: 'cosy', dividers: 'line' }

export const cartHeadingFields = {
  heading: { type: 'text' as const, label: 'Heading (optional)' },
  headingSize: { type: 'select' as const, label: 'Heading size', options: [{ value: 'sm', label: 'Small' }, { value: 'md', label: 'Medium' }, { value: 'lg', label: 'Large' }] },
}
export const cartHeadingDefaults = { heading: '', headingSize: 'md' }

export const cartItemFields = {
  showImage: { type: 'select' as const, label: 'Show product image', options: yesNo },
  imageSize: { type: 'number' as const, label: 'Image size (px)' },
  imageRadius: { type: 'number' as const, label: 'Image corner radius (px)' },
  showUnitPrice: { type: 'select' as const, label: 'Show unit price', options: yesNo },
  showLinePrice: { type: 'select' as const, label: 'Show line total', options: yesNo },
  quantityControl: { type: 'select' as const, label: 'Quantity control', options: [{ value: 'stepper', label: 'Stepper (- / +)' }, { value: 'input', label: 'Number box' }, { value: 'readonly', label: 'Read-only' }] },
  showRemove: { type: 'select' as const, label: 'Show remove button', options: yesNo },
  removeStyle: { type: 'select' as const, label: 'Remove button style', options: [{ value: 'icon', label: 'Cross' }, { value: 'text', label: 'Text ("Remove")' }] },
  showAvailability: { type: 'select' as const, label: 'Show stock warnings', options: yesNo },
  showPreorder: { type: 'select' as const, label: 'Show pre-order badge', options: yesNo },
}
export const cartItemDefaults = {
  showImage: 'yes', imageSize: 64, imageRadius: 6,
  showUnitPrice: 'no', showLinePrice: 'yes', quantityControl: 'stepper',
  showRemove: 'yes', removeStyle: 'icon', showAvailability: 'yes', showPreorder: 'yes',
}

export const cartCouponFields = {
  showCoupon: { type: 'select' as const, label: 'Show coupon field', options: yesNo },
  couponPlaceholder: { type: 'text' as const, label: 'Coupon placeholder' },
  couponButtonLabel: { type: 'text' as const, label: 'Coupon button label' },
  couponLinkLabel: { type: 'text' as const, label: 'Coupon link label' },
}
export const cartCouponDefaults = { showCoupon: 'yes', couponPlaceholder: 'Coupon code', couponButtonLabel: 'Apply', couponLinkLabel: 'Add coupon code' }

// Any delivery or service charge broken out of the line prices gets its own row,
// labelled by whichever module priced it - there is nothing to set here.
export const cartTotalsFields = {
  showItemCount: { type: 'select' as const, label: 'Show item count', options: yesNo },
  showSubtotal: { type: 'select' as const, label: 'Show totals', options: yesNo },
  subtotalLabel: { type: 'text' as const, label: 'Subtotal label' },
  taxLabel: { type: 'text' as const, label: 'Tax label' },
  totalLabel: { type: 'text' as const, label: 'Total label' },
  stickyBar: { type: 'select' as const, label: 'Sticky checkout bar', options: yesNo },
}
export const cartTotalsDefaults = {
  showItemCount: 'yes', showSubtotal: 'yes', subtotalLabel: 'Subtotal', taxLabel: 'VAT', totalLabel: 'Total',
  stickyBar: 'yes',
}

// Undo belongs with whichever block carries the remove buttons.
export const cartUndoFields = {
  undoRemove: { type: 'select' as const, label: 'Undo after removing an item', options: yesNo },
}
export const cartUndoDefaults = { undoRemove: 'yes' }

export const cartCheckoutFields = {
  checkoutLabel: { type: 'text' as const, label: 'Checkout button label' },
  checkoutBg: colourField('Checkout button colour'),
  checkoutText: colourField('Checkout text colour'),
  checkoutFullWidth: { type: 'select' as const, label: 'Checkout full width', options: yesNo },
  checkoutRadius: { type: 'number' as const, label: 'Checkout corner radius (px)' },
}
export const cartCheckoutDefaults = {
  checkoutLabel: 'Proceed to checkout', checkoutBg: 'var(--color-primary)', checkoutText: 'var(--color-on-primary)',
  checkoutFullWidth: 'yes', checkoutRadius: 8,
}

export const cartEmptyFields = {
  emptyText: { type: 'text' as const, label: 'Empty cart message' },
  continueLabel: { type: 'text' as const, label: 'Continue-shopping label' },
  continueHref: { type: 'text' as const, label: 'Continue-shopping link' },
}
export const cartEmptyDefaults = { emptyText: 'Your basket is empty.', continueLabel: 'Continue shopping', continueHref: '/shop' }

// The price accent is read by both split blocks (line prices in one, the Total
// in the other); the panel background and radius only dress the item list.
export const cartAccentFields = {
  accentColour: colourField('Price accent colour'),
}
export const cartAccentDefaults = { accentColour: '' }

export const cartPanelFields = {
  panelBg: colourField('Panel background (cards / table)'),
  borderRadius: { type: 'number' as const, label: 'Panel corner radius (px)' },
}
export const cartPanelDefaults = { panelBg: 'var(--color-surface)', borderRadius: 12 }

// Puck's defaultProps are checked against the block's own prop type, and every
// cart option is optional on CartFullOptions, so the grouped defaults compose
// into whichever subset a block offers.
export type CartBlockDefaults = CartFullOptions
