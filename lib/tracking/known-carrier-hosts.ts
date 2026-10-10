// Hosts a tracking link may point at when it did NOT come from somebody here.
//
// A parcel recorded on the order screen takes any web address: a person typed
// it, and it is theirs. A parcel recorded from another module's announcement
// (lib/despatch-observer.ts) carries a link read out of an email, and an email
// can come from anybody - so that link is kept only when it goes to a carrier
// this shop knows, and otherwise the parcel keeps its number and drops the
// link. It is the second line of defence; the announcer applies its own first.
//
// The carriers this shop can read for itself (DPD, the Multidrop-style pages,
// GFS), and the big parcel carriers, whose pages show the parcel and nothing
// else. Its own file with no imports, so a test can read it on its own.

const KNOWN: readonly RegExp[] = [
  /(^|\.)dpd(local)?\.co\.uk$/,
  /(^|\.)dpd\.(com|ie)$/,
  /(^|\.)multidrop\.link$/,
  /(^|\.)justshoutgfs\.com$/,
  /(^|\.)royalmail\.com$/,
  /(^|\.)parcelforce\.(com|net)$/,
  /(^|\.)(evri\.com|hermes-europe\.co\.uk|myhermes\.co\.uk)$/,
  /(^|\.)ups\.com$/,
  /(^|\.)dhl\.(com|co\.uk|de)$/,
  /(^|\.)fedex\.com$/,
  /(^|\.)tnt\.(com|co\.uk)$/,
  /(^|\.)yodel\.co\.uk$/,
  /(^|\.)(dx\.co\.uk|thedx\.co\.uk)$/,
  /(^|\.)apc-overnight\.com$/,
  /(^|\.)tuffnells\.co\.uk$/,
  /(^|\.)palletways\.com$/,
  /(^|\.)gfsdeliver\.com$/,
  /(^|\.)aithd\.(com|de)$/,
  /^fieldly\.lt-innovations\.co\.uk$/,
]

/** Whether a link goes to a carrier this shop knows. False for anything that
 *  is not an http(s) address. */
export function isKnownCarrierLink(url: string | null | undefined): boolean {
  if (!url) return false
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false
    const host = parsed.hostname.toLowerCase()
    return KNOWN.some((pattern) => pattern.test(host))
  } catch {
    return false
  }
}
