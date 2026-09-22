import { z } from 'zod'
import {
  SHIPPING_ZONE_MAX_POSTCODES,
  SHIPPING_ZONE_POSTCODE_LINE_MAX_LENGTH,
  formatLimit,
} from '@/modules/shop/lib/admin-input-limits'

// One of a shipping zone's two postcode lists - the lines that put a shopper IN
// the zone, or the lines that keep them out - as the create and update routes
// take it. Both lists are read in full on every checkout that resolves a zone,
// so they carry a ceiling: generous enough for every UK postcode sector with
// room to spare (see lib/admin-input-limits.ts), low enough that a pasted list
// of every individual postcode in the country is turned away rather than
// stored.
//
// The line that is too long is named in the message, because the tax and
// shipping screen shows it to the owner and in a list of thousands "a line is
// too long" is no help in finding it.
export const ZonePostcodeList = z
  .array(z.string())
  .max(
    SHIPPING_ZONE_MAX_POSTCODES,
    `A postcode list can have at most ${formatLimit(SHIPPING_ZONE_MAX_POSTCODES)} lines. A prefix ("SW") or a range ("AB30-AB32") covers many postcodes in one line.`,
  )
  .superRefine((lines, ctx) => {
    const long = lines.find((line) => line.length > SHIPPING_ZONE_POSTCODE_LINE_MAX_LENGTH)
    if (long === undefined) return
    const shown = long.length > 40 ? `${long.slice(0, 40)}…` : long
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `"${shown}" is too long for a postcode line - ${SHIPPING_ZONE_POSTCODE_LINE_MAX_LENGTH} characters at most.`,
    })
  })
