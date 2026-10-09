// The one AIT Home Delivery link a parcel is recorded with: the short address
// in their text and email, 'https://aithd.com/kz0vkrz'.
//
// The code at the end IS the parcel as far as their tracking is concerned - it
// is the key their own tracking page asks their feed with, and there is no
// separate tracking number worth typing in. So an AIT parcel carries this link
// and nothing else, and the code is read back out of it whenever it is needed
// rather than stored twice.
//
// Their German site lives on aithd.de and answers from a different feed, so the
// link keeps whichever of the two it was given rather than being forced onto
// the British one.
//
// Its own file, with no imports, because the dispatch form runs it as you type
// and has no business pulling a schema library into the admin bundle for it.

const SHORT_LINK = /^(?:https?:\/\/)?(?:www\.)?aithd\.(com|de)\/([A-Za-z0-9]{5,16})\/?(?:[?#].*)?$/i

/** An example, for placeholders and error messages. */
export const AIT_LINK_EXAMPLE = 'https://aithd.com/kz0vkrz'

export type AitLink = {
  code: string
  /** 'com' answers from their UK feed, 'de' from their German one. */
  region: 'com' | 'de'
}

/**
 * The code and site out of an AIT tracking link, or null for anything else.
 *
 * Strict on purpose: a bare code, an order number or their long
 * '/<client>/<order>' address is refused rather than guessed at - the long one
 * is not a key their feed accepts, and a parcel saved with a link this cannot
 * read is a parcel whose tracking quietly never appears. The address without
 * 'https://' or 'www.' is still the same link, so both are forgiven, and so is
 * anything after a '?' or '#' that a messaging app tacked on - it is dropped
 * when the link is stored.
 */
export function aitLinkParts(value: string | null | undefined): AitLink | null {
  const m = SHORT_LINK.exec(value?.trim() ?? '')
  if (!m) return null
  return { region: (m[1] ?? 'com').toLowerCase() === 'de' ? 'de' : 'com', code: m[2] as string }
}

/** The link as stored, whatever shape it was pasted in. */
export function aitLink(parts: AitLink): string {
  return `https://aithd.${parts.region}/${parts.code}`
}
