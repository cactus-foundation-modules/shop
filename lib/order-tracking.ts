// Where "keep track of your order" points, and the signature on the link.
//
// One link goes in every order email, and it decides what to do when it is
// clicked rather than when it is sent. That is the whole design:
//
//   - a customer who is signed in and owns the order is sent straight through
//     to their own order page, exactly as if they had found it themselves,
//   - anybody else is asked for the delivery postcode first.
//
// Deciding at send time was the obvious alternative and it is wrong, because an
// email outlives the fact it was written against. A guest who creates an
// account a fortnight later - which the confirmation page invites them to do,
// and which claims their old orders automatically - would spend the rest of the
// order's life clicking a link that asked them to prove something they are
// already signed in as.
import { createHmac, timingSafeEqual } from 'crypto'
import { getSiteUrl } from '@/lib/config/env'
import type { ShpConfig } from '@/modules/shop/lib/config'

/** The address the tracker always has, whatever the owner has done with the
 *  root slug. Everything else here is a nicer way of reaching this. */
export const TRACK_ORDER_PATH = '/shop/track-order'

function getKey(): string {
  const key = process.env.ENCRYPTION_KEY
  if (!key) throw new Error('ENCRYPTION_KEY is not set - required for order tracking links.')
  return key
}

/**
 * The token on a tracking link.
 *
 * Its own namespace, as every other token in this module has its own: a shop
 * whose invoice numbers and order numbers share a prefix must not find that a
 * token minted for one opens the other.
 *
 * It proves WHICH order the link was issued for, and nothing about who is
 * holding it - which is exactly why the postcode is still asked for on the
 * other end. These emails are forwarded: to a partner, to an accounts
 * department, to whoever actually presses the button at the bank. A token that
 * let the holder straight in would hand every one of them the delivery address
 * and the run of the invoice.
 */
export function signOrderTrackingToken(orderNumber: string): string {
  return createHmac('sha256', getKey()).update(`track:${orderNumber}`).digest('base64url')
}

/** Constant-time, and false for anything malformed rather than throwing. */
export function verifyOrderTrackingToken(orderNumber: string, token: string | null | undefined): boolean {
  if (!orderNumber || !token) return false
  try {
    const a = Buffer.from(signOrderTrackingToken(orderNumber))
    const b = Buffer.from(token)
    if (a.length !== b.length) return false
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}

/**
 * The owner's root-level address for the tracker, if they have one.
 *
 * Sanitised here rather than trusted from the settings box, because the value
 * ends up in a URL and in a comparison against every bare slug on the site. One
 * segment, lower case, the characters a slug is allowed and nothing else; a box
 * with a slash or a space in it reads as "the owner meant nothing valid" and
 * turns the root address off rather than claiming something surprising.
 */
export function orderTrackingRootSlug(
  config: Pick<ShpConfig, 'guestOrderTrackingEnabled' | 'orderTrackingRootSlug'>,
): string | null {
  if (!config.guestOrderTrackingEnabled) return null
  const slug = config.orderTrackingRootSlug.trim().toLowerCase()
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) ? slug : null
}

/** Where to send somebody who wants to look an order up from scratch. */
export function orderTrackingBasePath(
  config: Pick<ShpConfig, 'guestOrderTrackingEnabled' | 'orderTrackingRootSlug'>,
): string {
  const slug = orderTrackingRootSlug(config)
  return slug ? `/${slug}` : TRACK_ORDER_PATH
}

/**
 * The site-relative address of one order's tracking page, token and all.
 *
 * Always under /shop/track-order, deliberately, and never under the owner's
 * root slug. The root slug is one bare segment claimed through core's
 * bare-slug route (see lib/root-slug.ts) - core hands the module the slug and
 * nothing after it, so /track-order/DW000172 is not an address the shop can be
 * sure of answering. The root slug is a front door for somebody typing it;
 * this is a link that has to work for years from inside an email.
 */
export function orderTrackingPath(orderNumber: string): string {
  return `${TRACK_ORDER_PATH}/${encodeURIComponent(orderNumber)}?t=${signOrderTrackingToken(orderNumber)}`
}

/**
 * The absolute address for an email, or an empty string where there is nothing
 * to link to.
 *
 * Empty rather than throwing, and empty rather than null, because it is going
 * straight into a merge tag: a shop with no SITE_URL set is a shop mid-setup,
 * and an order confirmation must not fail to send over a link. A merge tag
 * nothing fills collapses to nothing, so the line simply is not there.
 */
export function orderTrackingUrl(
  orderNumber: string,
  config: Pick<ShpConfig, 'guestOrderTrackingEnabled' | 'orderTrackingRootSlug'>,
): string {
  if (!config.guestOrderTrackingEnabled) return ''
  try {
    return `${getSiteUrl()}${orderTrackingPath(orderNumber)}`
  } catch {
    return ''
  }
}
