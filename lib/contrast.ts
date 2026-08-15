// WCAG contrast, for the places the shop lets an owner pick two colours and put
// text on top of one of them.
//
// It exists because the tag badges let you choose a background and a wording
// colour independently, per tag, per theme - four pickers - and nothing checked
// that the pair could actually be read. Deskwell's own "New" badge came out at
// 2.22:1 in dark mode, which is roughly light grey on mint: legible if you
// already know it says New.
//
// The point is a warning at the moment of choosing, not a rule. An owner who
// wants a low-contrast badge can still have one; they simply get told.

/** WCAG 2.1 minimum for normal-sized text (1.4.3 Contrast Minimum, level AA). */
export const AA_NORMAL_TEXT = 4.5
/** The same for large text - 24px, or 18.66px when bold. Badges are neither. */
export const AA_LARGE_TEXT = 3

/** #rgb / #rrggbb (with or without the hash) to 0-255 triples. Null for
 *  anything else, including the CSS variables the pickers also accept - a
 *  var(--color-primary) cannot be measured here, and guessing at one would be
 *  worse than saying nothing. */
export function parseHex(value: string | null | undefined): [number, number, number] | null {
  if (!value) return null
  const hex = value.trim().replace(/^#/, '')
  if (/^[0-9a-f]{3}$/i.test(hex)) {
    return [
      parseInt(hex[0]! + hex[0]!, 16),
      parseInt(hex[1]! + hex[1]!, 16),
      parseInt(hex[2]! + hex[2]!, 16),
    ]
  }
  if (/^[0-9a-f]{6}$/i.test(hex)) {
    return [
      parseInt(hex.slice(0, 2), 16),
      parseInt(hex.slice(2, 4), 16),
      parseInt(hex.slice(4, 6), 16),
    ]
  }
  return null
}

function channel(value: number): number {
  const c = value / 255
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
}

/** Relative luminance, per WCAG's own definition. */
export function luminance([r, g, b]: [number, number, number]): number {
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

/** Contrast ratio between two colours, 1 (identical) to 21 (black on white).
 *  Null when either colour is not a hex this can measure. */
export function contrastRatio(
  a: string | null | undefined,
  b: string | null | undefined,
): number | null {
  const first = parseHex(a)
  const second = parseHex(b)
  if (!first || !second) return null
  const l1 = luminance(first)
  const l2 = luminance(second)
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1]
  return (hi + 0.05) / (lo + 0.05)
}

/** Whether a foreground/background pair clears AA for normal-sized text. Null
 *  when it cannot be measured, which callers should treat as "say nothing"
 *  rather than as a pass or a fail. */
export function meetsAaNormal(
  foreground: string | null | undefined,
  background: string | null | undefined,
): boolean | null {
  const ratio = contrastRatio(foreground, background)
  return ratio == null ? null : ratio >= AA_NORMAL_TEXT
}

/** Ratio rounded the way it is conventionally written: "4.5:1", one decimal. */
export function formatRatio(ratio: number): string {
  return `${Math.round(ratio * 10) / 10}:1`
}
