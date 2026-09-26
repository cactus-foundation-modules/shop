// The one DPD link a parcel is recorded with: the follow-my-parcel address in
// DPD's own email, 'https://www.dpd.co.uk/d/6dPoGvP3DMDN'.
//
// It is the only DPD link worth keeping. The code in it opens a session on
// their feed - the stop number, the driver, the minutes away - and the session
// hands back the parcel number too, so nothing else needs typing in. The long
// 'track.dpd.co.uk/parcels/…' address is a page in somebody's browser, and a
// parcel recorded with that alone reads fifteen fields rather than ninety.
//
// Its own file, with no imports, because the dispatch form runs it as you type
// and has no business pulling a schema library into the admin bundle for it.

const FOLLOW_LINK = /^(?:https?:\/\/)?(?:www\.)?dpd\.co\.uk\/d\/([A-Za-z0-9]{6,32})\/?$/i

/** An example, for placeholders and error messages. */
export const DPD_FOLLOW_LINK_EXAMPLE = 'https://www.dpd.co.uk/d/6dPoGvP3DMDN'

/**
 * The code out of a DPD follow-my-parcel link, or null for anything else.
 *
 * Strict on purpose: a bare code, a tracking-number page or somebody else's
 * link is refused rather than guessed at, because a parcel saved with the wrong
 * one is a parcel whose tracking quietly never appears. The address without
 * 'https://' or 'www.' is still the same link, so both are forgiven.
 */
export function dpdFollowLinkCode(value: string | null | undefined): string | null {
  const m = FOLLOW_LINK.exec(value?.trim() ?? '')
  return m?.[1] ?? null
}

/** The link as stored, whatever shape it was pasted in. */
export function dpdFollowLink(code: string): string {
  return `https://www.dpd.co.uk/d/${code}`
}
