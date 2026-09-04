import { prisma } from '@/lib/db/prisma'
import RegisterForm from '@/components/members/RegisterForm'
import { getMembersConfig } from '@/lib/members/config'
import { getMemberAreaPath } from '@/lib/members/paths'
import type { ShpConfig } from '@/modules/shop/lib/config'
import { TRACK_ORDER_CSS } from '@/modules/shop/components/public/track-order-css'

// "Keep all your orders in one place", offered to a guest who has just proved
// themselves into one of them.
//
// The strongest moment there is to ask. The confirmation page asks too, thirty
// seconds after somebody has paid, when they are still deciding whether they
// trust the shop; this asks a week later, on the page they came back to - which
// means they have already done the thing an account would have saved them, and
// they know it.
//
// Their address is the one on the order, so registering with it hands them
// every guest order they have ever placed the moment they verify it (see
// listOrdersForMember). That is the offer, and it is why the email is filled in
// rather than left blank.
//
// Behind the owner's existing post-purchase switch rather than a second one of
// its own: an owner who has said they do not want their customers pestered
// about accounts has said it once and should not have to say it twice.

type Props = {
  config: Pick<ShpConfig, 'postPurchaseAccountPrompt'>
  customerEmail: string
}

export default async function GuestOrderAccountOffer({ config, customerEmail }: Props) {
  if (!config.postPurchaseAccountPrompt) return null

  const membersConfig = await getMembersConfig()
  // An invite-only site is excluded: sending somebody to a door that will only
  // turn them away is worse than not asking at all.
  if (!membersConfig.enabled || membersConfig.registrationMode === 'INVITE_ONLY') return null

  // The policy people are agreeing to, read from where the register page reads
  // it, so an owner who changes it does not find the old one still on offer here.
  const siteConfig = await prisma.siteConfig.findUnique({
    where: { id: 'singleton' },
    select: { privacyPolicyPageId: true },
  })
  const privacyPage = siteConfig?.privacyPolicyPageId
    ? await prisma.infoPage.findUnique({
        where: { id: siteConfig.privacyPolicyPageId },
        select: { slug: true },
      })
    : null

  return (
    // Carries its own styling because the page it lands on is the order detail,
    // which injects sod-* and knows nothing about sot-*. Injecting the whole
    // sheet for one card is the cheap end of the trade: it is a string in the
    // same response, and the alternative is a fifth copy of a card, a heading
    // and a bulleted list.
    <div className="sot-account">
      <style dangerouslySetInnerHTML={{ __html: TRACK_ORDER_CSS }} />
      <h2>Keep all your orders in one place</h2>
      <p>
        Create an account with {customerEmail} and this order joins it automatically, along with every
        other order you have placed with us. No postcode to type next time.
      </p>
      <ul>
        <li>Every order in one list, past and present</li>
        <li>Check out faster - your address is already there</li>
        <li>No password to remember: sign in from a link we email you</li>
      </ul>
      {/* The form itself rather than a link to it, for the same reason the
          confirmation page carries one: sending somebody off to another page to
          fill in three boxes is how an offer worth a minute gets declined. The
          heading is suppressed because the card above already has one, and the
          verify-email destination is spelt out because the form cannot work it
          out from an address bar that says /shop. */}
      <RegisterForm
        registrationMode={membersConfig.registrationMode}
        initialEmail={customerEmail}
        privacyPolicyUrl={privacyPage?.slug ? `/${privacyPage.slug}` : undefined}
        collectUsername={membersConfig.registrationCollectUsername}
        collectDisplayName={membersConfig.registrationCollectDisplayName}
        verifyEmailUrl={`/${getMemberAreaPath()}/verify-email`}
        showHeading={false}
      />
    </div>
  )
}
