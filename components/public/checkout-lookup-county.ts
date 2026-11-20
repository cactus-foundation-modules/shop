import type { ShpAddressForm } from '@/modules/shop/components/public/checkout-state'

// The county an address finder put in the form, and the postcode it came with.
//
// A county belongs to a postcode, not to a form. Picked out of a lookup, the
// two arrive together and are right together. But the shopper - or their
// browser's autofill, which happily rewrites the town and postcode and leaves a
// box it has nothing for alone - can then change the postcode without ever
// touching the county, and the order goes out with a county from the first
// address and a postcode from the second. A Rotherham delivery labelled
// "Greater London" is what that looks like: the finder's top hit for "22 Percy
// Street" is the one in London W1T.
export type LookupCounty = { county: string; postcode: string }

// The outward code - the half of a UK postcode that names the area, and so the
// county. "S65 1ED" -> "S65". Read off a postcode with or without its space,
// and off a half-typed one, which simply compares as a different area until it
// is finished. Anything that is not a UK postcode compares whole.
export function outwardCode(postcode: string): string {
  const tidy = postcode.toUpperCase().replace(/\s+/g, '')
  return /^[A-Z]{1,2}\d[A-Z\d]?\d[A-Z]{2}$/.test(tidy) ? tidy.slice(0, -3) : tidy
}

// What the county box should hold after `key` changes to `value`, given the
// county a lookup last filled in (null when none did, or the shopper has since
// made the county their own). Only ever touches a county that is still exactly
// the lookup's: one the shopper typed is theirs and is never second-guessed.
//
// - Postcode moved to another area: the lookup's county no longer describes it,
//   so it goes. Blank is safe - county is optional on every UK label.
// - Postcode moved back to the lookup's area with the box still blank: the
//   county comes back, so deleting and retyping a postcode loses nothing.
export function countyAfterEdit(
  current: ShpAddressForm,
  key: keyof ShpAddressForm,
  value: string,
  lookup: LookupCounty | null,
): string {
  if (key === 'county') return value
  if (!lookup || key !== 'postcode' || !lookup.county) return current.county
  const sameArea = outwardCode(value) === outwardCode(lookup.postcode)
  if (!sameArea && current.county === lookup.county) return ''
  if (sameArea && current.county === '') return lookup.county
  return current.county
}

// Whether an edit hands the county over to the shopper, so the lookup's claim
// on it should be dropped. Typing in the county box is the shopper deciding.
export function editOwnsCounty(key: keyof ShpAddressForm): boolean {
  return key === 'county'
}
