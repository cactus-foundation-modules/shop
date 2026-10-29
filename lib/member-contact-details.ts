import { getShopConfigCached } from '@/modules/shop/lib/config'
import { getShopGate } from '@/modules/shop/lib/access'

// Shop's answer to core's `members.contact-details` point: whether the account
// overview shows the "Your details" card, the name and organisation the
// checkout fills its boxes in from.
//
// The owner's switch (`accountContactDetailsEnabled`, on by default so a shop
// that already had the card keeps it). Off, and the account stops asking - the
// checkout still asks for a name on every order, which is where it is needed.
// Nothing is asked for while the shop is shut to this visitor either: a box
// promising to save typing at a checkout they cannot reach is no promise.
export async function shopMemberContactDetails(): Promise<boolean> {
  const [config, gate] = await Promise.all([getShopConfigCached(), getShopGate()])
  return config.accountContactDetailsEnabled && !gate.blocked
}
