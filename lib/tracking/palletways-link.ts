// Palletways tracking links, and the one shape a customer can actually open.
//
// Their track and trace is two pages. index.php?dc_syscon=<id> is the public
// one: status and due day, and a box asking for the delivery postcode. The
// full details - scans, the due-by time, both addresses - load from tt2.php,
// which refuses anybody who did not arrive from their own page ("Direct access
// not permitted"). A tt2.php link pasted onto a parcel therefore opens to that
// refusal for the customer, and carries their postcode in the address bar of
// every email it goes out in. So a recorded link is shown as the index page.
//
// No imports: the customer's order page and the emails both run this.

const ID = /^\d{11}$/

/** The 11-digit Palletways tracking ID out of a link or a bare number. */
export function palletwaysTrackingId(value: string | null | undefined): string | null {
  const text = value?.trim() ?? ''
  if (!text) return null
  if (ID.test(text)) return text
  try {
    const url = new URL(text)
    if (!/(^|\.)palletways\.com$/i.test(url.hostname)) return null
    const id = url.searchParams.get('dc_syscon')?.trim() ?? ''
    return ID.test(id) ? id : null
  } catch {
    return null
  }
}

/** Their public tracking page for one consignment. */
export function palletwaysTrackingLink(id: string): string {
  return `https://track2.palletways.com/index.php?dc_syscon=${encodeURIComponent(id)}`
}

/** A Palletways full-details link as their public page; anything else as it came. */
export function openablePalletwaysLink(url: string): string {
  try {
    const parsed = new URL(url)
    if (!/(^|\.)palletways\.com$/i.test(parsed.hostname) || !/\/tt2\.php$/i.test(parsed.pathname)) return url
    const id = palletwaysTrackingId(url)
    return id ? palletwaysTrackingLink(id) : url
  } catch {
    return url
  }
}
