import { redirect, notFound } from 'next/navigation'
import { getMemberFromCookie } from '@/lib/members/session'
import { getMembersConfig } from '@/lib/members/config'
import { getMemberAreaPath } from '@/lib/members/paths'
import { AddressesClient } from '@/modules/shop/components/public/AddressesClient'

export const metadata = { title: 'Saved addresses' }

export default async function ShopAccountAddressesPage() {
  const membersConfig = await getMembersConfig()
  if (!membersConfig.enabled) notFound()

  const member = await getMemberFromCookie()
  if (!member) redirect(`/${getMemberAreaPath()}/login?redirect=/shop/account/addresses`)

  return (
    <div style={{ maxWidth: 640, margin: '0 auto', padding: '2rem 1.5rem' }}>
      <h1 style={{ fontSize: '1.5rem' }}>Saved addresses</h1>
      <AddressesClient />
    </div>
  )
}
