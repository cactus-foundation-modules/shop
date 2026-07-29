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
    quantityControl: { type: 'select' as const, label: 'Quantity control', options: [{ value: 'stepper', label: 'Stepper (- / +)' }, { value: 'input', label: 'Number box' }, { value: 'readonly', label: 'Read-only' }] },
    showRemove: { type: 'select' as const, label: 'Show remove button', options: yesNo },
    removeStyle: { type: 'select' as const, label: 'Remove button style', options: [{ value: 'icon', label: 'Cross' }, { value: 'text', label: 'Text ("Remove")' }] },
    showAvailability: { type: 'select' as const, label: 'Show stock warnings', options: yesNo },
    showPreorder: { type: 'select' as const, label: 'Show pre-order badge', options: yesNo },
    // Coupon
    showCoupon: { type: 'select' as const, label: 'Show coupon field', options: yesNo },
    couponPlaceholder: { type: 'text' as const, label: 'Coupon placeholder' },
    couponButtonLabel: { type: 'text' as const, label: 'Coupon button label' },
    // Totals
    showItemCount: { type: 'select' as const, label: 'Show item count', options: yesNo },
    showSubtotal: { type: 'select' as const, label: 'Show totals', options: yesNo },
    subtotalLabel: { type: 'text' as const, label: 'Subtotal label' },
    // Any delivery or service charge broken out of the line prices gets its own
    // row, labelled by whichever module priced it - there is nothing to set here.
    taxLabel: { type: 'text' as const, label: 'Tax label' },
    totalLabel: { type: 'text' as const, label: 'Total label' },
    stickyBar: { type: 'select' as const, label: 'Sticky checkout bar', options: yesNo },
    undoRemove: { type: 'select' as const, label: 'Undo after removing an item', options: yesNo },
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
    showUnitPrice: 'no', showLinePrice: 'yes', quantityControl: 'stepper',
    showRemove: 'yes', removeStyle: 'icon', showAvailability: 'yes', showPreorder: 'yes',
    showCoupon: 'yes', couponPlaceholder: 'Coupon code', couponButtonLabel: 'Apply',
    showItemCount: 'yes', showSubtotal: 'yes', subtotalLabel: 'Subtotal', taxLabel: 'VAT', totalLabel: 'Total',
    stickyBar: 'yes', undoRemove: 'yes',
    checkoutLabel: 'Proceed to checkout', checkoutBg: 'var(--color-primary)', checkoutText: 'var(--color-on-primary)',
    checkoutFullWidth: 'yes', checkoutRadius: 8,
    emptyText: 'Your cart is empty.', continueLabel: 'Continue shopping', continueHref: '/shop',
    accentColour: '', panelBg: 'var(--color-surface)', borderRadius: 12,
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
