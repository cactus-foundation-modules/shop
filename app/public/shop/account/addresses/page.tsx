import { redirect, notFound } from 'next/navigation'
import { getMemberFromCookie } from '@/lib/members/session'
import { getMembersConfig } from '@/lib/members/config'
import { getMemberAreaPath } from '@/lib/members/paths'
import MemberAccountShell from '@/components/members/account/MemberAccountShell'
import { AddressesClient } from '@/modules/shop/components/public/AddressesClient'
import { getShopGate } from '@/modules/shop/lib/access'
import { ShopClosedNotice, ShopStaffPreviewBanner } from '@/modules/shop/components/public/ShopClosedNotice'

export const metadata = { title: 'Saved addresses' }
export const dynamic = 'force-dynamic'

export default async function ShopAccountAddressesPage() {
  const membersConfig = await getMembersConfig()
  if (!membersConfig.enabled) notFound()

  const gate = await getShopGate()
  if (gate.blocked) return <ShopClosedNotice message={gate.message} />

  const member = await getMemberFromCookie()
  if (!member) redirect(`/${getMemberAreaPath()}/login?redirect=/shop/account/addresses`)

  return (
    <MemberAccountShell member={member} maxWidth={880}>
      {gate.staffPreview && <ShopStaffPreviewBanner />}
      <h1 style={{ fontSize: 'var(--text-2xl)', fontWeight: 'var(--font-semibold)', margin: '0 0 var(--space-2)', color: 'var(--color-text)' }}>
        Saved addresses
      </h1>
      <p style={{ color: 'var(--color-text-muted)', margin: '0 0 var(--space-4)' }}>
        Every address you order to is kept here, and offered back at checkout, so you only type one once.
      </p>
      <AddressesClient />
    </MemberAccountShell>
  )
}
