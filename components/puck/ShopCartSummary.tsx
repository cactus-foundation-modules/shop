import { CartSummaryClient, type CartSummaryOptions } from '@/modules/shop/components/public/CartSummaryClient'
import { DRAWER_DEFAULTS } from '@/modules/shop/components/public/cart-drawer-options'
import { cartNoteFields } from '@/modules/shop/components/puck/cart-fields'
import { SiteColourField } from '@/lib/puck/SiteColourField'

export type ShopCartSummaryProps = CartSummaryOptions

const yesNo = [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }]
// Puck prints no label of its own above a custom field, so the swatch grid has
// to carry it - without `label` passed through, the sidebar showed rows of
// unexplained colours with only "Dark mode colour" to go on. Same wiring core's
// own colour fields use (lib/puck/config.core.tsx).
const colourField = (label: string) => ({
  type: 'custom' as const,
  label,
  render: ({ value, onChange, field }: { value: string; onChange: (v: string) => void; field: { label?: string } }) => (
    <SiteColourField value={value} onChange={onChange} label={field?.label ?? label} />
  ),
})

// Editor render: seed a sample cart so the widget previews populated (no fetch).
export function ShopCartSummary(props: ShopCartSummaryProps) {
  return <CartSummaryClient {...props} preview />
}

export const shopCartSummaryPuckComponent = {
  label: 'Shop: Cart Summary',
  fields: {
    // Icon
    icon: { type: 'select' as const, label: 'Icon', options: [
      { value: 'cart', label: 'Trolley' },
      { value: 'bag', label: 'Bag' },
      { value: 'basket', label: 'Basket' },
      { value: 'tag', label: 'Tag' },
      { value: 'none', label: 'No icon' },
    ] },
    iconSize: { type: 'number' as const, label: 'Icon size (px)' },
    iconColour: colourField('Icon colour'),
    label: { type: 'text' as const, label: 'Text label (blank = icon only, with a "Basket" tooltip)' },
    // Box
    variant: { type: 'select' as const, label: 'Style', options: [
      { value: 'bordered', label: 'Bordered pill' },
      { value: 'filled', label: 'Filled' },
      { value: 'plain', label: 'Plain (no box)' },
    ] },
    bgColour: colourField('Background colour'),
    borderColour: colourField('Border colour'),
    textColour: colourField('Text colour'),
    hoverColour: colourField('Hover colour'),
    borderRadius: { type: 'number' as const, label: 'Corner radius (px)' },
    // Count
    showCount: { type: 'select' as const, label: 'Show item count', options: yesNo },
    countStyle: { type: 'select' as const, label: 'Count style', options: [
      { value: 'badge', label: 'Badge on icon' },
      { value: 'inline', label: 'Inline text' },
    ] },
    itemWord: { type: 'text' as const, label: 'Item word (singular)' },
    itemWordPlural: { type: 'text' as const, label: 'Item word (plural)' },
    badgeBg: colourField('Badge colour'),
    badgeText: colourField('Badge text colour'),
    hideBadgeWhenZero: { type: 'select' as const, label: 'Hide badge when empty', options: yesNo },
    // Total + behaviour
    showSubtotal: { type: 'select' as const, label: 'Show subtotal', options: yesNo },
    hideWhenEmpty: { type: 'select' as const, label: 'Hide widget when cart empty', options: yesNo },
    // Click behaviour. The slide-out keeps the shopper on the page they were
    // reading and shows the same basket the cart page would - lines, delivery
    // services, whole-basket promises and all. It stays shut in this editor: it
    // covers the page it belongs to, not the canvas you design it on.
    clickAction: { type: 'select' as const, label: 'When clicked', options: [
      { value: 'link', label: 'Go to the cart page' },
      { value: 'drawer', label: 'Slide out a basket summary' },
    ] },
    drawerHeading: { type: 'text' as const, label: 'Slide-out: heading' },
    drawerSide: { type: 'select' as const, label: 'Slide-out: opens from', options: [
      { value: 'right', label: 'Right' },
      { value: 'left', label: 'Left' },
    ] },
    drawerWidth: { type: 'number' as const, label: 'Slide-out: width (px)' },
    drawerShowImage: { type: 'select' as const, label: 'Slide-out: show product images', options: yesNo },
    drawerShowDelivery: { type: 'select' as const, label: 'Slide-out: show delivery options', options: yesNo },
    drawerSubtotalLabel: { type: 'text' as const, label: 'Slide-out: subtotal label' },
    drawerCheckoutLabel: { type: 'text' as const, label: 'Slide-out: checkout button' },
    drawerViewCartLabel: { type: 'text' as const, label: 'Slide-out: cart page button (empty hides it)' },
    drawerEmptyText: { type: 'text' as const, label: 'Slide-out: empty basket text' },
    drawerContinueLabel: { type: 'text' as const, label: 'Slide-out: keep shopping link' },
    // Both footer buttons, fully dressed. Each swatch row carries its own
    // dark-mode row underneath, so there is no separate set of dark fields to
    // keep in step. Leave a hover colour blank and that arm simply does not
    // change on hover.
    drawerCheckoutBg: colourField('Checkout button: background'),
    drawerCheckoutBorder: colourField('Checkout button: border'),
    drawerCheckoutText: colourField('Checkout button: text'),
    drawerCheckoutHoverBg: colourField('Checkout button: background on hover'),
    drawerCheckoutHoverBorder: colourField('Checkout button: border on hover'),
    drawerCheckoutHoverText: colourField('Checkout button: text on hover'),
    drawerViewCartBg: colourField('View full basket button: background'),
    drawerViewCartBorder: colourField('View full basket button: border'),
    drawerViewCartText: colourField('View full basket button: text'),
    drawerViewCartHoverBg: colourField('View full basket button: background on hover'),
    drawerViewCartHoverBorder: colourField('View full basket button: border on hover'),
    drawerViewCartHoverText: colourField('View full basket button: text on hover'),
    drawerRadius: { type: 'number' as const, label: 'Slide-out: button corner radius (px)' },
    // The whole-basket note the panel prints above the subtotal - another
    // module's sentence ("everything by Fri 4 Sep"), dressed here. Its own set,
    // held separately from the cart page's and the checkout's, so the panel can
    // show a plain ticked line where checkout shows a picture, or nothing at all.
    ...cartNoteFields('Slide-out: basket note'),
    // Audience. NB: keep this key as `audience`, never `visibility` - core owns a
    // responsive-visibility field of that exact name on every block and strips it
    // from render props, which would silently disable this gate.
    audience: { type: 'select' as const, label: 'Who can see this', options: [
      { value: 'everyone', label: 'Everyone' },
      { value: 'admin', label: 'Admins only' },
    ] },
  },
  defaultProps: {
    icon: 'cart', iconSize: 20, iconColour: '', label: '',
    variant: 'bordered', bgColour: '', borderColour: '', textColour: '', hoverColour: '', borderRadius: 8,
    showCount: 'yes', countStyle: 'badge', itemWord: 'item', itemWordPlural: 'items',
    badgeBg: 'var(--color-primary)', badgeText: 'var(--color-on-primary)', hideBadgeWhenZero: 'yes',
    showSubtotal: 'no', hideWhenEmpty: 'no', audience: 'everyone',
    clickAction: 'link', ...DRAWER_DEFAULTS,
  } as ShopCartSummaryProps,
  render: ShopCartSummary,
}

// RSC half lives in ShopCartSummary.rsc.tsx (wired via `rscImport` in
// cactus.module.json): the 'Admins only' visibility gate reads the admin session
// cookie, which pulls next/headers + Prisma - server-only, must stay out of this
// editor-safe bundle.
