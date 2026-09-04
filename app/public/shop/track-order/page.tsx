import { notFound } from 'next/navigation'
import { getMemberFromCookie } from '@/lib/members/session'
import { getMembersConfig } from '@/lib/members/config'
import { getMemberAreaPath } from '@/lib/members/paths'
import { getShopGate } from '@/modules/shop/lib/access'
import { getShopConfigCached } from '@/modules/shop/lib/config'
import { ShopClosedNotice, ShopStaffPreviewBanner } from '@/modules/shop/components/public/ShopClosedNotice'
import OrderAccessForm from '@/modules/shop/components/public/OrderAccessForm'
import { TRACK_ORDER_CSS } from '@/modules/shop/components/public/track-order-css'

export const metadata = { title: 'Track your order' }
export const dynamic = 'force-dynamic'

// Where somebody with an order number and no account starts.
//
// Deliberately not behind /shop/account/: nothing here belongs to an account,
// and the people who need it most are the ones who decided at checkout that
// they did not want one. It is the address a shop prints on a delivery note and
// reads out on the telephone, which is also why the owner can put it on the
// root of the site as well - see lib/order-tracking.ts.
//
// Exported as a view rather than only as a route, because the root-slug page
// renders exactly the same thing at exactly the same moment (app/root/[slug]).
// Two copies would be two things to keep in step for no gain.

export async function TrackOrderPageView({ orderNumber }: { orderNumber?: string } = {}) {
  const gate = await getShopGate()
  if (gate.blocked) return <ShopClosedNotice message={gate.message} />

  const config = await getShopConfigCached()
  // A shop that has switched guest tracking off has no such page, rather than a
  // page that turns everyone away. See lib/config.ts.
  if (!config.guestOrderTrackingEnabled) notFound()

  // The offer of an account, and the three reasons it is worth having. Only
  // where there is somewhere to register: an invite-only site would be sending
  // people to a door that will not open, and somebody already signed in has
  // been asked once already.
  const [membersConfig, member] = await Promise.all([getMembersConfig(), getMemberFromCookie()])
  const offerAccount =
    membersConfig.enabled && membersConfig.registrationMode !== 'INVITE_ONLY' && !member

  return (
    <div style={{ maxWidth: 640, margin: '0 auto', padding: '2rem 1.5rem' }}>
      <style dangerouslySetInnerHTML={{ __html: TRACK_ORDER_CSS }} />
      {gate.staffPreview && <ShopStaffPreviewBanner />}

      <div className="sot">
        <header className="sot-head">
          <h1 className="sot-title">Track your order</h1>
          <p className="sot-lede">
            No account needed. Give us your order number and the postcode it is going to, and we will
            show you where it has got to - along with your invoice, your delivery details and anything
            you still need to do.
          </p>
        </header>

        <div className="sot-card">
          <OrderAccessForm mode="lookup" orderNumber={orderNumber} />
        </div>

        {offerAccount && (
          <div className="sot-account">
            <h2>Rather not do this every time?</h2>
            <p>
              An account keeps every order you place in one place, so there is nothing to look up and
              nothing to remember.
            </p>
            <ul>
              <li>Every order in one list, past and present</li>
              <li>Check out faster next time - your address is already there</li>
              <li>No password to remember: sign in from a link we email you</li>
            </ul>
            <div className="sot-actions">
              <a className="sot-btn sot-btn-primary" href={`/${getMemberAreaPath()}/register`}>
                Create an account
              </a>
              <a className="sot-btn sot-btn-ghost" href={`/${getMemberAreaPath()}/login`}>
                I already have one
              </a>
            </div>
            <p className="sot-hint">
              Use the same email address you ordered with and your past orders join it on their own.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

export default async function ShopTrackOrderPage() {
  return TrackOrderPageView()
}
