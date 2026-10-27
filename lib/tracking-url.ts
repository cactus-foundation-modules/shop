// One rule about a tracking link, in one place.
//
// The value is typed into the dispatch modal by a shop owner, stored on the
// parcel, and then put in front of a shopper as something to press - in their
// email and on their own order page. That makes it the single most likely
// place on the shop for a `javascript:` URL to be clicked by somebody who
// trusts the sender.
//
// The dispatch route already refuses anything that is not http(s). This is the
// second half of the same rule, applied on the way OUT: a row written before
// that check existed, imported, or set by hand has never been past it, and
// "the writer validated it" is not something a rendering surface should have
// to take on trust.

import { openablePalletwaysLink } from '@/modules/shop/lib/tracking/palletways-link'

/** The url if it is safe to hand somebody, '' if it is not. A Palletways
 *  full-details link comes back as their public page, the only one of the two
 *  a customer can open - see palletways-link.ts. */
export function safeTrackingUrl(value: string | null | undefined): string {
  const url = value?.trim() ?? ''
  if (!url) return ''
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? openablePalletwaysLink(url) : ''
  } catch {
    // Not a whole address. A tracking link has to be one - there is no origin
    // to resolve a relative one against in an inbox, and no sensible guess.
    return ''
  }
}
