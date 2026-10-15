import { VatSwitchClient } from '@/modules/shop/components/public/VatSwitchClient'
import { resolveTaxViewSwitch } from '@/modules/shop/lib/tax-display'
import { shopVatSwitchPuckComponent, type ShopVatSwitchProps } from './ShopVatSwitch'

// Server (RSC) half of Shop: VAT Switch. Reads the shop's own switch setting so
// the block prints nothing at all on a shop that has not turned the shopper's
// with/without VAT switch on - a header should not carry a control that does
// nothing. It reads cached config only, so a block that sits on every page adds
// no queries of its own.
export async function ShopVatSwitchRsc(props: ShopVatSwitchProps) {
  const view = await resolveTaxViewSwitch()
  if (!view) return null
  // Strip Puck's injected `puck`/`editMode` bag (live functions) before crossing
  // the client boundary - the same 500 ShopCartFull hit when it was not.
  const options = { ...props } as Record<string, unknown>
  delete options.puck
  delete options.editMode
  return <VatSwitchClient {...(options as ShopVatSwitchProps)} view={view} />
}

export const shopVatSwitchPuckRscComponent = {
  ...shopVatSwitchPuckComponent,
  render: ShopVatSwitchRsc,
}
