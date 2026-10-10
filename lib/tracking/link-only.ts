// Couriers whose one tracking link IS the parcel.
//
// AIT and Fieldly both key their tracking off a code in a short link, take no
// tracking number worth typing, and can only be read if the link is exactly
// theirs. Everything that records a parcel - the dispatch form as you type, the
// dispatch route, a supplier's despatch announcement - asks here rather than
// naming either, so the rules are written once.
//
// No imports beyond the two link files, which have none: the dispatch form
// runs this in the browser.

import { AIT_LINK_EXAMPLE, aitLink, aitLinkParts } from '@/modules/shop/lib/tracking/ait-link'
import { FIELDLY_LINK_EXAMPLE, fieldlyCode, fieldlyLink } from '@/modules/shop/lib/tracking/fieldly-link'

export type LinkOnlySource = 'ait' | 'fieldly'

type LinkOnlyRule = {
  /** The link in its one stored shape, or null when it is not theirs. */
  canonical: (value: string) => string | null
  example: string
  /** Refusal for the dispatch route. */
  wrongLink: string
}

export const LINK_ONLY: Readonly<Record<LinkOnlySource, LinkOnlyRule>> = {
  ait: {
    canonical: (value) => {
      const parts = aitLinkParts(value)
      return parts ? aitLink(parts) : null
    },
    example: AIT_LINK_EXAMPLE,
    wrongLink: `For AIT Home Delivery the tracking link has to be the short link from their message, like ${AIT_LINK_EXAMPLE}.`,
  },
  fieldly: {
    canonical: (value) => {
      const code = fieldlyCode(value)
      return code ? fieldlyLink(code) : null
    },
    example: FIELDLY_LINK_EXAMPLE,
    wrongLink: `For this courier the tracking link has to be their Fieldly tracking link, like ${FIELDLY_LINK_EXAMPLE}.`,
  },
}

export function isLinkOnlySource(value: string | null | undefined): value is LinkOnlySource {
  return value === 'ait' || value === 'fieldly'
}

/** Which link-only courier a link belongs to, judged by the link alone. */
export function linkOnlySourceOf(value: string | null | undefined): LinkOnlySource | null {
  if (!value) return null
  if (aitLinkParts(value)) return 'ait'
  if (fieldlyCode(value)) return 'fieldly'
  return null
}
