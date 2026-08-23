import { getMemberFromCookie } from '@/lib/members/session'
import { AddressesClient } from '@/modules/shop/components/public/AddressesClient'
import { resolveCheckoutAddressLookup } from '@/modules/shop/lib/checkout-address-lookup'
import { getShopGate } from '@/modules/shop/lib/access'

// The address book, drawn into the one-page account. The page at
// /shop/account/addresses is the same thing and stays where it is.
export async function ShopAddressesSection() {
  const member = await getMemberFromCookie()
  if (!member) return null

  const gate = await getShopGate()
  if (gate.blocked) return null

  return (
    <div>
      <h2 style={{ fontSize: 'var(--text-xl)', fontWeight: 'var(--font-semibold)', margin: '0 0 var(--space-2)', color: 'var(--color-text)' }}>
        Addresses &amp; Phone Numbers
      </h2>
      <p style={{ color: 'var(--color-text-muted)', margin: '0 0 var(--space-4)' }}>
        Every address you order to is kept here with its own phone number, and offered back at checkout, so you only
        type one once.
      </p>
      {/* Resolved here rather than in the client island for the same reason
          checkout does it: the extension registry statically imports
          Prisma-touching code and must never reach a client bundle. */}
      <AddressesClient addressLookup={resolveCheckoutAddressLookup()} />
    </div>
  )
}
