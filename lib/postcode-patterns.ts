// Matching a shopper's postcode against the pattern list on a shipping zone -
// both the list that puts them IN a zone and the list that keeps them out of it.
//
// Two pattern shapes share one box, because a real-world exclusion list mixes
// them freely:
//
//   SW            a plain prefix: anything starting with it
//   AB30-AB32     a district range: AB30, AB31 and AB32, and nothing else
//   AB30-32       the same thing, second area left off
//
// Ranges are not a convenience. The obvious prefix spelling of a Highlands and
// Islands list is wrong in both directions at once: "PH1" as a prefix catches
// PH1 itself and the whole of PH10-PH19, when the list wants PH10 upwards and
// deliberately not PH1; "AB3" catches AB33-AB39 when only AB30-AB32 were meant.
// A range compares the district as a NUMBER, which is the only reading that
// gets those right.
//
// Anything that is not a well-formed range is treated as a prefix, which is
// exactly what this module did before ranges existed.

export type PostcodePattern =
  | { kind: 'prefix'; prefix: string }
  | { kind: 'range'; area: string; from: number; to: number }

/** Whitespace out, upper case in. The one shape everything else here expects. */
export function normalisePostcode(raw: string): string {
  return raw.replace(/\s+/g, '').toUpperCase()
}

// A complete UK postcode ends in an inward code - digit, letter, letter - and
// the district has to be read from what is left after that is taken off.
// Otherwise "GY1 0AA" normalises to GY10AA and reads as district 10 rather than
// district 1, quietly excluding a Guernsey address the list never named.
// A partial postcode (an outward code on its own, which is all the cart has
// before the checkout asks for the rest) is already the outward code.
const FULL_POSTCODE = /^[A-Z]{1,2}[0-9][A-Z0-9]?[0-9][A-Z]{2}$/

export function outwardCodeOf(normalised: string): string {
  return FULL_POSTCODE.test(normalised) ? normalised.slice(0, -3) : normalised
}

const RANGE = /^([A-Z]{1,2})([0-9]{1,2})-([A-Z]{0,2})([0-9]{1,2})$/
const OUTWARD_DISTRICT = /^([A-Z]{1,2})([0-9]{1,2})/

/**
 * Read one line of a zone's pattern list. Never fails: a line that is not a
 * usable range is a prefix, since that is what every pattern was before ranges
 * arrived and an admin's existing list must keep meaning what it meant.
 */
export function parsePostcodePattern(raw: string): PostcodePattern {
  const text = normalisePostcode(raw)
  const m = RANGE.exec(text)
  if (m) {
    const [, area, fromDigits, toArea, toDigits] = m
    // A range across two different areas ("AB30-BT32") is not a range anybody
    // means; it falls through to the prefix reading, where it matches nothing
    // and is flagged to the admin by isUnderstoodPostcodePattern.
    if (!toArea || toArea === area) {
      const a = Number(fromDigits)
      const b = Number(toDigits)
      // Written backwards is a typo rather than an empty range, so it is read
      // the way round it was plainly meant.
      return { kind: 'range', area: area!, from: Math.min(a, b), to: Math.max(a, b) }
    }
  }
  return { kind: 'prefix', prefix: text }
}

/**
 * Whether a line will do anything at all. A range that is really a range, or a
 * prefix that is at least one letter or digit. Used by the admin screen to
 * point out lines that would sit there matching nothing - a silent no-op on a
 * list of thirty pasted ranges is the failure worth catching.
 */
export function isUnderstoodPostcodePattern(raw: string): boolean {
  const text = normalisePostcode(raw)
  if (text.length === 0) return false
  if (text.includes('-')) return parsePostcodePattern(text).kind === 'range'
  return /^[A-Z0-9]+$/.test(text)
}

/**
 * How specifically a pattern matches a postcode, or null for no match. The
 * number is only ever compared with another one from this function: the
 * longest, most specific match is the one that decides a shopper's zone.
 */
export function matchPostcodePattern(pattern: PostcodePattern, normalisedPostcode: string): number | null {
  if (pattern.kind === 'prefix') {
    if (!pattern.prefix) return null
    return normalisedPostcode.startsWith(pattern.prefix) ? pattern.prefix.length : null
  }
  const outward = outwardCodeOf(normalisedPostcode)
  const m = OUTWARD_DISTRICT.exec(outward)
  if (!m) return null
  const [, area, digits] = m
  if (area !== pattern.area) return null
  const district = Number(digits)
  if (district < pattern.from || district > pattern.to) return null
  // Scored as though the low end of the range had been written out as a prefix,
  // so "AB30-AB32" outranks the broader "AB" the way "AB30" would.
  return pattern.area.length + String(pattern.from).length
}

/** The most specific match across a whole list, or null if none of it matches. */
export function bestPostcodeMatch(patterns: string[], postcode: string): number | null {
  const normalised = normalisePostcode(postcode)
  let best: number | null = null
  for (const raw of patterns) {
    const score = matchPostcodePattern(parsePostcodePattern(raw), normalised)
    if (score !== null && (best === null || score > best)) best = score
  }
  return best
}

/** Whether any line in the list matches. Specificity does not come into it. */
export function matchesAnyPostcodePattern(patterns: string[], postcode: string): boolean {
  return bestPostcodeMatch(patterns, postcode) !== null
}
