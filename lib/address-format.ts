// How an address is tidied when a customer saves it: Title Case for the lines,
// town and county, and an upper-case, correctly spaced postcode.
//
// Pure and dependency-free so the same function runs on the server (every route
// that writes an address) and in the browser (on blur, so the customer sees the
// result and can correct it before it is saved).
//
// Principles, in the order they bite:
//  - Idempotent. formatAddressText(formatAddressText(x)) === formatAddressText(x),
//    because address-lookup results arrive well cased and must pass through.
//  - Trust the customer's capitals. In a field that mixes upper and lower case,
//    only words that are entirely lower case are touched, so McDonald, MacLeod
//    and BT Tower survive. A field that is ALL lower or ALL upper case is
//    treated as lazy or shouting and converted throughout.
//  - UK rules apply to UK addresses only. Anywhere else a field is changed only
//    when it is wholly lower or upper case, and then with a plain capital on
//    each word, because "van", "de" and "von" mean different things abroad.
//  - Names and company names are NOT handled here. See formatAddress.

/** Stay lower case anywhere but the start of a clause: Isle of Wight,
 *  Henley on Thames, Newton le Willows, Chorlton-cum-Hardy. */
const CONNECTORS = new Set(['of', 'the', 'and', 'upon', 'on', 'in', 'under', 'by', 'cum', 'le', 'la', 'de', 'en'])

/** Connectors that are only connectors inside a hyphenated name. Outside one,
 *  "Next" is a shop and "Super" is a word. y/yr/yn/ym are the Welsh articles. */
const HYPHEN_ONLY_CONNECTORS = new Set(['super', 'sub', 'next', 'y', 'yr', 'yn', 'ym'])

/** Always upper case. */
const ACRONYMS = new Set(['po', 'uk', 'nhs', 'bbc', 'bt'])

/** Regnal numbers. Kept upper case in an ALL CAPS field only: applied to every
 *  word, "MILL" would be read as a numeral. */
const ROMAN = new Set(['II', 'III', 'IV', 'VI', 'VII', 'VIII', 'IX', 'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI', 'XVII', 'XVIII', 'XIX', 'XX'])

/** Whole-token spellings that title casing would get wrong. */
const FIXED_TOKENS: Record<string, string> = { 'c/o': 'c/o', 'co-op': 'Co-op', 'plc': 'plc' }

const UK_COUNTRY = /^(gb|uk|gbr|im|je|gg|united kingdom|great britain|england|scotland|wales|northern ireland|isle of man|jersey|guernsey)$/i

export function isUkCountry(country: string | null | undefined): boolean {
  return UK_COUNTRY.test((country ?? 'GB').trim() || 'GB')
}

const upperFirst = (s: string) => (s ? s.charAt(0).toLocaleUpperCase('en-GB') + s.slice(1) : s)
const hasUpper = (s: string) => s !== s.toLocaleLowerCase('en-GB')
const hasLower = (s: string) => s !== s.toLocaleUpperCase('en-GB')

type Mode = 'lower' | 'upper' | 'mixed'

/** A plain capital on the first letter and lower case after, with the
 *  apostrophe and Mc rules. No connectors, no numerals: the building block. */
function capitaliseWord(word: string): string {
  const lower = word.toLocaleLowerCase('en-GB')
  if (/^mc\p{L}/u.test(lower)) return 'Mc' + upperFirst(lower.slice(2))
  const parts = lower.split(/(['’])/)
  let out = ''
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i] ?? ''
    if (i === 0) {
      out += upperFirst(part)
    } else if (part === "'" || part === '’') {
      out += part
    } else {
      // After an apostrophe: O'Neill, D'Arcy, L'Estrange get a capital; the
      // possessive in Bishop's and St John's does not.
      const before = parts[i - 2] ?? ''
      out += /^[odl]$/.test(before) ? upperFirst(part) : part
    }
  }
  return out
}

type Position = { first: boolean; hasNext: boolean; hyphenated: boolean }

/** One hyphen-free segment of a token, already stripped of outer punctuation. */
function formatSegment(core: string, mode: Mode, pos: Position): string {
  if (!/\p{L}/u.test(core)) return core
  const lower = core.toLocaleLowerCase('en-GB')
  const canBeConnector = !pos.first && pos.hasNext
  const isConnector = canBeConnector && (CONNECTORS.has(lower) || (pos.hyphenated && HYPHEN_ONLY_CONNECTORS.has(lower)))

  // In a mixed field leave anything the customer capitalised themselves, with
  // one exception: a Title Cased connector inside a hyphenated name, because
  // "Stratford-Upon-Avon" is the commonest way to get that name wrong.
  if (mode === 'mixed' && hasUpper(core)) {
    return pos.hyphenated && isConnector && core === upperFirst(lower) ? lower : core
  }

  if (/^\d+(st|nd|rd|th)$/.test(lower)) return lower
  if (isConnector) return lower
  // 12a, 3b, 2f1 (Scottish flats) and road codes A41, M25, B4100.
  if (/^\d+\p{L}\d*$/u.test(lower) || /^\p{L}\d+\p{L}?$/u.test(lower)) return lower.toLocaleUpperCase('en-GB')
  if (/^\p{L}$/u.test(lower)) return lower.toLocaleUpperCase('en-GB')
  if (ACRONYMS.has(lower)) return lower.toLocaleUpperCase('en-GB')
  if (/^\p{L}(\.\p{L})+$/u.test(lower)) return lower.toLocaleUpperCase('en-GB')
  if (mode === 'upper' && ROMAN.has(core)) return core

  // A slash splits two words (Upstairs/Downstairs); each is capitalised alone.
  return lower.split('/').map(capitaliseWord).join('/')
}

function formatToken(token: string, mode: Mode, clauseStart: boolean, hasNextToken: boolean): string {
  const m = /^([^\p{L}\p{N}]*)(.*?)([^\p{L}\p{N}]*)$/u.exec(token)
  if (!m) return token
  const [, lead, core, trail] = m
  if (!core) return token

  const fixed = FIXED_TOKENS[core.toLocaleLowerCase('en-GB')]
  if (fixed && !(mode === 'mixed' && hasUpper(core))) return lead + fixed + trail

  const segments = core.split('-')
  const out = segments.map((seg, i) => formatSegment(seg, mode, {
    first: clauseStart && i === 0,
    hasNext: i < segments.length - 1 || hasNextToken,
    hyphenated: segments.length > 1,
  }))
  return lead + out.join('-') + trail
}

/** Title case one line, town or county for a UK address. */
function formatUk(text: string): string {
  const mode: Mode = !hasUpper(text) ? 'lower' : !hasLower(text) ? 'upper' : 'mixed'
  const tokens = text.split(' ')
  let clauseStart = true
  return tokens.map((token, i) => {
    const out = formatToken(token, mode, clauseStart, i < tokens.length - 1)
    // A comma, semicolon, colon, bracket or dash starts a new clause, so
    // "Flat 1, The Old Mill" keeps its capital T.
    clauseStart = /[,;:(]$/.test(token) || /^[-–—]+$/.test(token)
    return out
  }).join(' ')
}

/** Elsewhere: only a wholly lower or upper case field is touched, and only
 *  with a capital on each word. */
function formatAbroad(text: string): string {
  if (hasUpper(text) && hasLower(text)) return text
  return text.split(' ').map((word) => word.split('-').map(capitaliseWord).join('-')).join(' ')
}

/** Title case a line, town or county. Whitespace is collapsed and trimmed. */
export function formatAddressText(value: string, country?: string | null): string {
  const text = value.trim().replace(/\s+/g, ' ')
  if (!text) return text
  return isUkCountry(country) ? formatUk(text) : formatAbroad(text)
}

/** Upper case, spaces collapsed. A UK postcode also gets its single space
 *  before the last three characters; any other country's is left as typed
 *  apart from the case. */
export function formatPostcode(value: string, country?: string | null): string {
  const text = value.trim().replace(/\s+/g, ' ').toLocaleUpperCase('en-GB')
  if (!isUkCountry(country)) return text
  if (/^GIR\s?0AA$/.test(text)) return 'GIR 0AA'
  const m = /^([A-Z]{1,2}\d[A-Z\d]?)\s?(\d[A-Z]{2})$/.exec(text)
  return m ? `${m[1]} ${m[2]}` : text
}

type AddressLike = {
  line1?: string
  line2?: string
  city?: string
  county?: string
  postcode?: string
  country?: string
}

/** Tidy the postal fields of an address. The customer's name, the company, the
 *  phone number and the country are returned exactly as given: names and
 *  company names are not title cased anywhere in the shop (the normalisers in
 *  customer-billing.ts only fold case to compare two of them). */
export function formatAddress<A extends AddressLike>(address: A): A {
  const country = address.country
  const out = { ...address }
  for (const key of ['line1', 'line2', 'city', 'county'] as const) {
    const v = out[key]
    if (typeof v === 'string') out[key] = formatAddressText(v, country) as A[typeof key]
  }
  if (typeof out.postcode === 'string') out.postcode = formatPostcode(out.postcode, country) as A['postcode']
  return out
}

/** One form box, for tidying on blur. Any key that is not a postal field
 *  (name, company, phone, country) comes back untouched. */
export function formatAddressField(key: string, value: string, country?: string | null): string {
  if (key === 'postcode') return formatPostcode(value, country)
  if (key === 'line1' || key === 'line2' || key === 'city' || key === 'county') return formatAddressText(value, country)
  return value
}
