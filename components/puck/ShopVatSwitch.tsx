import { VatSwitchClient, VAT_SWITCH_DEFAULTS, type VatSwitchOptions } from '@/modules/shop/components/public/VatSwitchClient'
import type { TaxViewSwitch } from '@/modules/shop/lib/tax-view-shared'
import { SiteColourField } from '@/lib/puck/SiteColourField'

export type ShopVatSwitchProps = VatSwitchOptions

// Same wiring as the cart summary's colour fields: Puck prints no label above a
// custom field, so the swatch grid carries it.
const colourField = (label: string) => ({
  type: 'custom' as const,
  label,
  render: ({ value, onChange, field }: { value: string; onChange: (v: string) => void; field: { label?: string } }) => (
    <SiteColourField value={value} onChange={onChange} label={field?.label ?? label} />
  ),
})

// The editor has no shop config to read, so it draws the switch from a sample
// that opens without VAT. It is inert here; the live site reads the real one.
const SAMPLE_VIEW: TaxViewSwitch = {
  defaultSide: 'ex',
  excludingNote: '',
  includingNote: '',
  showIncludingLabel: 'Show prices including VAT',
  showExcludingLabel: 'Show prices excluding VAT',
}

export function ShopVatSwitch(props: ShopVatSwitchProps) {
  return <VatSwitchClient {...props} view={SAMPLE_VIEW} preview />
}

export const shopVatSwitchPuckComponent = {
  label: 'Shop: VAT Switch',
  fields: {
    iconSize: { type: 'number' as const, label: 'Height (px) - the width is twice this' },
    iconColour: colourField('Colour'),
    hoverColour: colourField('Hover colour'),
    showLabel: { type: 'select' as const, label: 'Words beside the switch', options: [
      { value: 'no', label: 'No (a tooltip says what it does)' },
      { value: 'yes', label: 'Yes' },
    ] },
    labelExcluding: { type: 'text' as const, label: 'Words while prices are without VAT' },
    labelIncluding: { type: 'text' as const, label: 'Words while prices are with VAT' },
  },
  defaultProps: { ...VAT_SWITCH_DEFAULTS } as ShopVatSwitchProps,
  render: ShopVatSwitch,
}
