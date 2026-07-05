import { CartFullClient, type CartFullOptions } from '@/modules/shop/components/public/CartFullClient'
import { SiteColourField } from '@/lib/puck/SiteColourField'

// Full, configurable cart-display block. The cart itself lives in localStorage,
// so the widget is the CartFullClient island; this block wires ~30 look/behaviour
// options into it as plain props. Editor render seeds sample lines (preview);
// the RSC render is a SERVER component that passes only plain props across the
// boundary (Puck's <Render> chokes on the renderDropZone bag - same trick as
// ShopCartSummary), and the island fetches the live cart client-side.

export type ShopCartFullProps = CartFullOptions

export function ShopCartFull(props: ShopCartFullProps) {
  return <CartFullClient {...props} preview />
}

const yesNo = [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }]
const colourField = (label: string) => ({
  type: 'custom' as const,
  label,
  render: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => <SiteColourField value={value} onChange={onChange} />,
})

export const shopCartFullPuckComponent = {
  label: 'Shop: Cart',
  fields: {
    // Structure
    layoutStyle: { type: 'select' as const, label: 'Layout style', options: [{ value: 'rows', label: 'Rows' }, { value: 'cards', label: 'Cards' }, { value: 'table', label: 'Table' }] },
    maxWidth: { type: 'number' as const, label: 'Max width (px, 0 = full)' },
    density: { type: 'select' as const, label: 'Spacing', options: [{ value: 'compact', label: 'Compact' }, { value: 'cosy', label: 'Cosy' }, { value: 'roomy', label: 'Roomy' }] },
    dividers: { type: 'select' as const, label: 'Row dividers', options: [{ value: 'line', label: 'Line' }, { value: 'none', label: 'None' }] },
    // Heading
    heading: { type: 'text' as const, label: 'Heading (optional)' },
    headingSize: { type: 'select' as const, label: 'Heading size', options: [{ value: 'sm', label: 'Small' }, { value: 'md', label: 'Medium' }, { value: 'lg', label: 'Large' }] },
    // Items
    showImage: { type: 'select' as const, label: 'Show product image', options: yesNo },
    imageSize: { type: 'number' as const, label: 'Image size (px)' },
    imageRadius: { type: 'number' as const, label: 'Image corner radius (px)' },
    showUnitPrice: { type: 'select' as const, label: 'Show unit price', options: yesNo },
    showLinePrice: { type: 'select' as const, label: 'Show line total', options: yesNo },
    quantityControl: { type: 'select' as const, label: 'Quantity control', options: [{ value: 'input', label: 'Number box' }, { value: 'stepper', label: 'Stepper (- / +)' }, { value: 'readonly', label: 'Read-only' }] },
    showRemove: { type: 'select' as const, label: 'Show remove button', options: yesNo },
    removeStyle: { type: 'select' as const, label: 'Remove button style', options: [{ value: 'text', label: 'Text ("Remove")' }, { value: 'icon', label: 'Icon (bin)' }] },
    showAvailability: { type: 'select' as const, label: 'Show stock warnings', options: yesNo },
    showPreorder: { type: 'select' as const, label: 'Show pre-order badge', options: yesNo },
    // Coupon
    showCoupon: { type: 'select' as const, label: 'Show coupon field', options: yesNo },
    couponPlaceholder: { type: 'text' as const, label: 'Coupon placeholder' },
    couponButtonLabel: { type: 'text' as const, label: 'Coupon button label' },
    // Totals
    showItemCount: { type: 'select' as const, label: 'Show item count', options: yesNo },
    showSubtotal: { type: 'select' as const, label: 'Show subtotal', options: yesNo },
    subtotalLabel: { type: 'text' as const, label: 'Subtotal label' },
    // Checkout button
    checkoutLabel: { type: 'text' as const, label: 'Checkout button label' },
    checkoutBg: colourField('Checkout button colour'),
    checkoutText: colourField('Checkout text colour'),
    checkoutFullWidth: { type: 'select' as const, label: 'Checkout full width', options: yesNo },
    checkoutRadius: { type: 'number' as const, label: 'Checkout corner radius (px)' },
    // Empty state
    emptyText: { type: 'text' as const, label: 'Empty cart message' },
    continueLabel: { type: 'text' as const, label: 'Continue-shopping label' },
    continueHref: { type: 'text' as const, label: 'Continue-shopping link' },
    // Colours / panels
    accentColour: colourField('Price accent colour'),
    panelBg: colourField('Panel background (cards / table)'),
    borderRadius: { type: 'number' as const, label: 'Panel corner radius (px)' },
  },
  defaultProps: {
    layoutStyle: 'rows', maxWidth: 640, density: 'cosy', dividers: 'line',
    heading: '', headingSize: 'md',
    showImage: 'yes', imageSize: 64, imageRadius: 6,
    showUnitPrice: 'no', showLinePrice: 'yes', quantityControl: 'input',
    showRemove: 'yes', removeStyle: 'text', showAvailability: 'yes', showPreorder: 'yes',
    showCoupon: 'yes', couponPlaceholder: 'Coupon code', couponButtonLabel: 'Apply',
    showItemCount: 'yes', showSubtotal: 'yes', subtotalLabel: 'Subtotal',
    checkoutLabel: 'Proceed to checkout', checkoutBg: 'var(--color-primary)', checkoutText: 'var(--color-on-primary)',
    checkoutFullWidth: 'yes', checkoutRadius: 8,
    emptyText: 'Your cart is empty.', continueLabel: 'Continue shopping', continueHref: '/shop',
    accentColour: '', panelBg: 'var(--color-surface)', borderRadius: 12,
  } as ShopCartFullProps,
  render: ShopCartFull,
}

// RSC half: server wrapper renders the client island with live props (no preview).
export function ShopCartFullRsc(props: ShopCartFullProps) {
  return <CartFullClient {...props} />
}

export const shopCartFullPuckRscComponent = {
  ...shopCartFullPuckComponent,
  render: ShopCartFullRsc,
}
