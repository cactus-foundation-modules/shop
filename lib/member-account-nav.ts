import { getMembersConfig } from '@/lib/members/config'
import { getShopGate } from '@/modules/shop/lib/access'
import { countOpenRequestsForMember } from '@/modules/shop/lib/db/order-requests'
import type { MemberAccountNavItem } from '@/lib/members/account-nav'

// Shop's tabs in the member account nav (core's `members.account-nav` point).
//
// Orders used to be two text links on a card, pointing at pages that rendered
// outside the account area entirely - no tabs, no way back. They are tabs now,
// and the pages wear the same chrome as Profile and Security.
//
// Nothing is contributed when the shop is shut to this visitor: a tab that
// leads to a "we are closed" notice is worse than no tab.
export async function shopMemberAccountNav(
  member: { id: string },
): Promise<MemberAccountNavItem[]> {
  const [membersConfig, gate] = await Promise.all([getMembersConfig(), getShopGate()])
  if (!membersConfig.enabled || gate.blocked) return []

  // The pill counts requests waiting on the shop, not on the member - it is
  // there to say "we have not forgotten you", which is the thing a customer
  // who has asked for a refund actually wants to see.
  const openRequests = await countOpenRequestsForMember(member.id)

  return [
    { key: 'orders', label: 'Orders', href: '/shop/account/orders', badge: openRequests },
    { key: 'addresses', label: 'Addresses', href: '/shop/account/addresses' },
  ]
}
