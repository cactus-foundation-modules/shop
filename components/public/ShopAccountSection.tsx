import Link from 'next/link'
import { getMemberFromCookie } from '@/lib/members/session'

// Contributed to the core `members.account-section` extension point (Q10) -
// links out to the module-owned, member-session-gated pages under /shop/account.
export async function ShopAccountSection() {
  const member = await getMemberFromCookie()
  if (!member) return null

  return (
    <div className="card" style={{ padding: '1.25rem', marginTop: '1rem' }}>
      <h2 className="card-title" style={{ margin: '0 0 0.75rem' }}>Orders &amp; addresses</h2>
      <div style={{ display: 'flex', gap: '1rem' }}>
        <Link href="/shop/account/orders" style={{ color: 'var(--color-primary)', textDecoration: 'none' }}>Order history</Link>
        <Link href="/shop/account/addresses" style={{ color: 'var(--color-primary)', textDecoration: 'none' }}>Saved addresses</Link>
      </div>
    </div>
  )
}
