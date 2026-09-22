import { z } from 'zod'

// Ceilings for every box a person can type an address or a contact detail
// into, shared by each route that writes one: the checkout, the manual order an
// admin keys in, the member address book, and the billing address a customer
// puts right after the order.
//
// They are ceilings, not rules. Nothing an honest shopper types comes close -
// the longest UK street address fits comfortably inside a line, and a courier
// label prints far less than that - so the only thing they turn away is a
// hand-rolled request writing an essay onto an order row, a saved address, or a
// supplier's delivery label. Each one says which box it is about, because the
// message goes straight back to the person who typed it.
//
// Before these lived here, each route had its own copy of the address shape,
// and only the later ones had any ceiling at all - so the value the checkout
// accepted could be one the order hub then refused to save.

export const ADDRESS_NAME_MAX_LENGTH = 80
export const ADDRESS_LINE_MAX_LENGTH = 200
export const ADDRESS_CITY_MAX_LENGTH = 100
export const ADDRESS_COUNTY_MAX_LENGTH = 100
export const ADDRESS_POSTCODE_MAX_LENGTH = 16
export const ADDRESS_COUNTRY_MAX_LENGTH = 60
export const PHONE_MAX_LENGTH = 32
export const CUSTOMER_NAME_MAX_LENGTH = 160

const tooLong = (what: string, max: number) => `${what} is too long - ${max} characters at most.`

/** The address fields every full address shape shares. Spread into a
 *  `z.object` where a route needs to adjust one (the checkout's billing
 *  address, which has no name boxes). */
export const addressFields = {
  firstName: z.string().min(1).max(ADDRESS_NAME_MAX_LENGTH, tooLong('First name', ADDRESS_NAME_MAX_LENGTH)),
  lastName: z.string().min(1).max(ADDRESS_NAME_MAX_LENGTH, tooLong('Last name', ADDRESS_NAME_MAX_LENGTH)),
  line1: z.string().min(1).max(ADDRESS_LINE_MAX_LENGTH, tooLong('Address line 1', ADDRESS_LINE_MAX_LENGTH)),
  line2: z.string().max(ADDRESS_LINE_MAX_LENGTH, tooLong('Address line 2', ADDRESS_LINE_MAX_LENGTH)).optional(),
  city: z.string().min(1).max(ADDRESS_CITY_MAX_LENGTH, tooLong('Town or city', ADDRESS_CITY_MAX_LENGTH)),
  county: z.string().max(ADDRESS_COUNTY_MAX_LENGTH, tooLong('County', ADDRESS_COUNTY_MAX_LENGTH)).optional(),
  postcode: z.string().min(1).max(ADDRESS_POSTCODE_MAX_LENGTH, tooLong('Postcode', ADDRESS_POSTCODE_MAX_LENGTH)),
  country: z.string().min(2).max(ADDRESS_COUNTRY_MAX_LENGTH, tooLong('Country', ADDRESS_COUNTRY_MAX_LENGTH)).default('GB'),
  phone: z.string().max(PHONE_MAX_LENGTH, tooLong('Phone number', PHONE_MAX_LENGTH)).optional(),
}

/** A full postal address with a name on it - the delivery address at checkout
 *  and on a manual order, and a saved address in the member address book. */
export const BoundedAddressSchema = z.object(addressFields)

/** A customer's own name, as the checkout and a manual order take it. */
export const customerNameField = z.string().min(1).max(CUSTOMER_NAME_MAX_LENGTH, tooLong('Name', CUSTOMER_NAME_MAX_LENGTH))

/** An optional telephone number. The UK format check stays with each route. */
export const phoneField = z.string().max(PHONE_MAX_LENGTH, tooLong('Phone number', PHONE_MAX_LENGTH))
