import { claimGuestOrdersForMember, listOrdersByMemberId } from '@/modules/shop/lib/db/orders'
import type { ShpOrder } from '@/modules/shop/lib/types'

// Every order this member can see, guest orders at their own address included.
//
// The claim happens here rather than at registration because registration is
// core's business and a shop must not reach into it - and because doing it on
// read means an order placed as a guest AFTER signing up (a different browser,
// a signed-out tab) is picked up too, which a one-off sweep at sign-up would
// miss forever.
//
// The verification test is the whole safety of it: a member who has not proved
// they own the address gets nothing, because anyone can type someone else's
// email into a sign-up form and an unverified match would hand over that
// person's order history, delivery addresses and all. Shops with email
// verification switched off therefore claim nothing, which is the right way
// round - a missing order history is a nuisance, the alternative is a leak.
export async function listOrdersForMember(
  member: { id: string; email: string; emailVerified: boolean },
): Promise<ShpOrder[]> {
  if (member.emailVerified) await claimGuestOrdersForMember(member.id, member.email)
  return listOrdersByMemberId(member.id)
}
