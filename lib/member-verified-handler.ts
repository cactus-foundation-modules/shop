import { syncMemberFromOrders } from '@/modules/shop/lib/member-orders'

// The shop's answer to core's core.member-email-verified extension point.
//
// A shopper who checks out as a guest and makes an account afterwards used to
// stay nameless in Admin > Users until they happened to open their own orders
// page, because that page was the only thing that claimed their guest orders
// and copied the name and company across. Core now says the moment an address
// is verified, so the same claim-and-fill runs then, whoever did the verifying
// (the member, or an admin on their behalf).
//
// The contract's shape is spelt out here rather than imported from core, same
// as people-customers-provider.ts: structurally identical, and the shop still
// builds on a core from before the point existed, where it is never called.
//
// Core only ever calls this for a member whose address IS verified, so the
// claim below is safe. emailVerified is passed as true for that reason and no
// other: syncMemberFromOrders still gates the claim on it.
type MemberEmailVerifiedEvent = { memberId: string; email: string; marketingConsent: boolean | null }

export async function shopMemberEmailVerified(member: MemberEmailVerifiedEvent): Promise<void> {
  await syncMemberFromOrders({
    id: member.memberId,
    email: member.email,
    emailVerified: true,
    marketingConsent: member.marketingConsent,
  })
}
