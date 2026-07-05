import { CartSummaryClient, type CartSummaryOptions } from '@/modules/shop/components/public/CartSummaryClient'
import { SiteColourField } from '@/lib/puck/SiteColourField'

export type ShopCartSummaryProps = CartSummaryOptions

const yesNo = [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }]
const colourField = (label: string) => ({
  type: 'custom' as const,
  label,
  render: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => <SiteColourField value={value} onChange={onChange} />,
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
    label: { type: 'text' as const, label: 'Text label (optional)' },
    // Box
    variant: { type: 'select' as const, label: 'Style', options: [
      { value: 'bordered', label: 'Bordered pill' },
      { value: 'filled', label: 'Filled' },
      { value: 'plain', label: 'Plain (no box)' },
    ] },
    bgColour: colourField('Background colour'),
    borderColour: colourField('Border colour'),
    textColour: colourField('Text colour'),
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
  },
  defaultProps: {
    icon: 'cart', iconSize: 20, iconColour: '', label: '',
    variant: 'bordered', bgColour: '', borderColour: '', textColour: '', borderRadius: 8,
    showCount: 'yes', countStyle: 'badge', itemWord: 'item', itemWordPlural: 'items',
    badgeBg: 'var(--color-primary)', badgeText: 'var(--color-on-primary)', hideBadgeWhenZero: 'yes',
    showSubtotal: 'no', hideWhenEmpty: 'no',
  } as ShopCartSummaryProps,
  render: ShopCartSummary,
}

// RSC half: server wrapper renders the live client island (no preview seeding),
// passing only plain props across the boundary.
export function ShopCartSummaryRsc(props: ShopCartSummaryProps) {
  return <CartSummaryClient {...props} />
}

export const shopCartSummaryPuckRscComponent = {
  ...shopCartSummaryPuckComponent,
  render: ShopCartSummaryRsc,
}
