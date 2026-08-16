// UK phone numbers: one parser for the checkout field, the completeness check
// and the routes that write the number onto an order, so the box a shopper is
// told is wrong and the value the order stores can never drift apart.
//
// Deliberately no dependency on anything Node- or DOM-shaped: this is imported
// by a 'use client' component and by API routes alike.

// Spaces, hyphens and brackets are how people write a number, not part of it.
// The unusual characters are the same three typed differently - a non-breaking
// space out of a pasted email, an en dash out of a word processor.
const NOISE = /[\s()‐-―-]/g

// Everything you can say once the trunk 0 is off the front, by the digit that
// follows it. Lengths are of the whole national number including that 0.
//   01/02  geographic - almost all 11, a handful of old 4+5 areas are 10
//   03     non-geographic at geographic rates
//   05     corporate and VoIP
//   07     mobile, pager and personal
//   08     freephone and special rate - 0800 xxx xxx is the 10-digit one
//   09     premium rate
// 04 and 06 are not allocated, and a subscriber part never starts with a 0.
const LENGTHS_BY_PREFIX: Record<string, number[]> = {
  '1': [10, 11],
  '2': [11],
  '3': [11],
  '5': [11],
  '7': [11],
  '8': [10, 11],
  '9': [11],
}

// What a shopper reads when the box is wrong. Shown by the contact step and
// returned by the order-creating route, so both say the same thing.
export const UK_PHONE_MESSAGE = 'Enter a UK phone number, like 07445 163570 or 020 8138 0512.'

// The number in national form - leading 0, digits only - or null if it is not a
// UK number at all. Accepts the ways a person actually writes one: 07445163570,
// +44 7445 163570, +4407445163570, 0044 7445 163570 and the landline shapes.
export function parseUkPhone(input: string | null | undefined): string | null {
  const cleaned = (input ?? '').replace(NOISE, '')
  if (cleaned.length === 0) return null

  let subscriber: string
  if (cleaned.startsWith('+')) {
    const digits = cleaned.slice(1)
    // A country code that is not ours is not a number this shop can take.
    if (!/^\d+$/.test(digits) || !digits.startsWith('44')) return null
    subscriber = digits.slice(2)
  } else if (!/^\d+$/.test(cleaned)) {
    return null
  } else if (cleaned.startsWith('00')) {
    if (!cleaned.startsWith('0044')) return null
    subscriber = cleaned.slice(4)
  } else if (cleaned.startsWith('0')) {
    subscriber = cleaned.slice(1)
  } else {
    return null
  }

  // +44 (0)7445 ... and +4407445 ... are both common, and the 0 in them is the
  // trunk code the country code replaces. Exactly one comes off: a subscriber
  // part genuinely starting 0 does not exist, so a second one is nonsense and
  // falls through to the length check below as such.
  if (subscriber.startsWith('0')) subscriber = subscriber.slice(1)

  const national = `0${subscriber}`
  const allowed = LENGTHS_BY_PREFIX[national[1] ?? '']
  if (!allowed || !allowed.includes(national.length)) return null
  return national
}

export function isValidUkPhone(input: string | null | undefined): boolean {
  return parseUkPhone(input) !== null
}

// How the number is stored and shown back once it is accepted. Mobiles get the
// break people expect to read (five, then six); landlines are left as digits,
// because where the break falls depends on the area code and guessing it wrong
// reads worse than not breaking it at all.
export function formatUkPhone(input: string | null | undefined): string | null {
  const national = parseUkPhone(input)
  if (!national) return null
  return national.startsWith('07') ? `${national.slice(0, 5)} ${national.slice(5)}` : national
}

// The value to write onto an order. Canonical when we can read it, and the
// shopper's own text (trimmed) when we cannot - this runs on the admin's manual
// order route too, where an overseas number is a legitimate thing to type and
// throwing it away would lose the only way of reaching that customer. The public
// checkout refuses an unreadable number before it ever gets here.
export function normaliseStoredPhone(input: string | null | undefined): string | null {
  const trimmed = (input ?? '').trim()
  if (trimmed.length === 0) return null
  return formatUkPhone(trimmed) ?? trimmed
}
