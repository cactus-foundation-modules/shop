import type { InputHTMLAttributes, ReactNode } from 'react'

// Contract for the 'shop.checkout-address-lookup' extension point. A provider
// module (e.g. address-lookup-for-shop) registers a client component with these
// props; shop mounts it in place of the plain Address line 1 field.
//
// Shop keeps ownership of the input's markup and styling through renderInput -
// the provider gets to layer behaviour (suggestions dropdown, keyboard
// navigation, ARIA combobox wiring) over shop's own field without ever
// re-implementing it, so the field cannot drift visually from its siblings.
// The extra input props the provider passes are merged into shop's <input>;
// shop's own value/onChange/onBlur handling still runs first.

export type ShpLookupAddress = {
  line1: string
  line2: string
  city: string
  county: string
  postcode: string
}

export type ShopCheckoutAddressLookupProps = {
  // Current Address line 1 value (typing flows through shop's own onChange;
  // providers watch keystrokes via the onChange they pass to renderInput).
  value: string
  // Called with a complete address when the shopper picks a suggestion. Shop
  // fills line1/line2/city/county/postcode in one state update.
  onSelect: (address: ShpLookupAddress) => void
  // Renders shop's own labelled line1 input, merging the given props into it.
  renderInput: (inputProps: InputHTMLAttributes<HTMLInputElement>) => ReactNode
}
