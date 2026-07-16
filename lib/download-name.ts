// Building the Content-Disposition header for a digital-product download.
//
// The name a download arrives as is whatever the site owner's own computer called
// the file when they uploaded it: the digital-files upload route records
// `file.name` verbatim. Interpolating that straight into a header is how a double
// quote closes the parameter early, and how a CR or LF ends the header outright
// and starts another one of the sender's choosing. The name is operator-supplied
// rather than attacker-supplied here, but "the owner would have to do it to
// themselves" is no reason to leave a header injection in.

const DEL = 0x7f
const FIRST_PRINTABLE = 0x20
const LAST_PRINTABLE = 0x7e

/**
 * True for a character with no business in a filename: the C0 controls and DEL,
 * which would end the header outright (CR and LF) or arrive as rubbish; the
 * double quote, which ends the quoted parameter; and the slash and backslash,
 * which would make the name a path.
 *
 * Spelt out by code point rather than as a character class, and deliberately: the
 * obvious spelling of that class hides a range - space to double quote - which
 * silently eats exclamation marks and strips no control character whatsoever.
 * This is dull and it is right, which is the correct trade for a security check.
 */
function isUnsafe(ch: string): boolean {
  const code = ch.codePointAt(0) ?? 0
  if (code < FIRST_PRINTABLE || code === DEL) return true
  return ch === '"' || ch === '\\' || ch === '/'
}

/**
 * Collapse a stored filename to something safe in a header and sane to save to
 * disk.
 *
 * Unsafe characters become a space and runs of whitespace collapse, rather than
 * being escaped: a manual with a newline in its name is a typo, not a
 * requirement. Spaces, hyphens, apostrophes and accents all survive untouched,
 * because "Guide d'entretien - modèle 4491.pdf" is a perfectly good name for a
 * file and there is nothing unsafe about it.
 */
export function downloadFilename(filename: string): string {
  const cleaned = [...filename].map((ch) => (isUnsafe(ch) ? ' ' : ch)).join('')
  // A name that sanitises away to nothing still has to be called something.
  return cleaned.replace(/\s+/g, ' ').trim() || 'download'
}

/** Fold to plain ASCII for the legacy `filename` parameter. */
function toAscii(value: string): string {
  return [...value]
    .map((ch) => {
      const code = ch.codePointAt(0) ?? 0
      return code >= FIRST_PRINTABLE && code <= LAST_PRINTABLE ? ch : '_'
    })
    .join('')
}

/**
 * A full Content-Disposition value for a stored file.
 *
 * Both forms are emitted, per RFC 6266: a plain ASCII `filename` every browser
 * understands, and a percent-encoded `filename*` carrying the real thing. A site
 * owner who uploads a file named in Welsh, Greek or Chinese gets that name back,
 * and anything too old to know `filename*` still gets a sensible ASCII one rather
 * than the mojibake that putting UTF-8 bytes in a quoted string produces.
 */
export function contentDisposition(filename: string): string {
  const safe = downloadFilename(filename)
  return `attachment; filename="${toAscii(safe)}"; filename*=UTF-8''${encodeURIComponent(safe)}`
}
