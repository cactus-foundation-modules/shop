// The one Fieldly link a parcel is recorded with:
// 'https://fieldly.lt-innovations.co.uk/track/689C21A2D2'.
//
// Fieldly is the tracking system some two-man couriers run their rounds on
// (Jewell Enterprises, for one), and like AIT the code at the end IS the parcel
// as far as their tracking goes - it is the key their own page asks their feed
// with. So a Fieldly parcel carries this link and nothing else, and the code is
// read back out of it whenever it is needed rather than stored twice.
//
// Their codes are case-blind (the feed answers 689c21a2d2 and 689C21A2D2
// alike), so the stored link is upper-cased: one parcel, one spelling.
//
// Its own file, with no imports, because the dispatch form runs it as you type.

const LINK = /^(?:https?:\/\/)?fieldly\.lt-innovations\.co\.uk\/track\/([A-Za-z0-9]{6,20})\/?(?:[?#].*)?$/i

/** An example, for placeholders and error messages. */
export const FIELDLY_LINK_EXAMPLE = 'https://fieldly.lt-innovations.co.uk/track/689C21A2D2'

/**
 * The tracking code out of a Fieldly link, or null for anything else.
 *
 * Strict on purpose, like aitLinkParts: a bare code or an order number is
 * refused rather than guessed at. The address without 'https://' is still the
 * same link, and anything after a '?' or '#' is dropped when it is stored.
 */
export function fieldlyCode(value: string | null | undefined): string | null {
  const m = LINK.exec(value?.trim() ?? '')
  return m ? (m[1] as string).toUpperCase() : null
}

/** The link as stored, whatever shape it was pasted in. */
export function fieldlyLink(code: string): string {
  return `https://fieldly.lt-innovations.co.uk/track/${code.toUpperCase()}`
}
