import { FAQ_QUERY_KEY } from '@/modules/shop/lib/courier-faqs'
import { REPORT_ISSUE_QUERY_KEY } from '@/modules/shop/lib/order-requests'

// What a link in an email asked the order page to DO, carried across the
// postcode gate that stands between the link and the page.
//
// Every order link in every email points at /shop/track-order/NUMBER, which
// then either redirects a proved visitor to their order page or asks a guest
// for the delivery postcode first. Both of those threw the query string away,
// so a link that said "open the delivery questions" or "open the issue report"
// landed on a page that opened neither - and the customer, who had clicked the
// thing that promised it, went looking for the button by hand. The ?faq=1 link
// in the delivery email had never once worked from a customer's inbox.
//
// An allowlist rather than the whole query string, deliberately. What comes in
// is somebody else's URL: forwarding the lot would let a crafted link put
// arbitrary query onto an authenticated page, and the two keys below are the
// only two that mean anything on the other end.

const INTENT_KEYS = [FAQ_QUERY_KEY, REPORT_ISSUE_QUERY_KEY] as const

type Query = Record<string, string | string[] | undefined>

/**
 * The intent keys off a tracking link, as a query string ready to append -
 * `?faq=1`, or an empty string when the link asked for nothing.
 *
 * Only ever `=1`: these are switches, and the value that arrives is not passed
 * on. A key set to anything else is a key that was not set by us and is
 * dropped.
 */
export function orderLinkIntentQuery(query: Query): string {
  const params = new URLSearchParams()
  for (const key of INTENT_KEYS) {
    const raw = query[key]
    if ((Array.isArray(raw) ? raw[0] : raw) === '1') params.set(key, '1')
  }
  const asked = params.toString()
  return asked ? `?${asked}` : ''
}

/** Whether one intent key is set, on a page reading its own query string. */
export function orderLinkIntentSet(query: Query, key: (typeof INTENT_KEYS)[number]): boolean {
  const raw = query[key]
  return (Array.isArray(raw) ? raw[0] : raw) === '1'
}
