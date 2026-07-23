import { z } from 'zod'

// Shared by the create (POST) and edit (PUT) supplier endpoints so the two can
// never drift on what a valid supplier looks like.

// Optional free-text field: an empty box means "nothing recorded", which is null
// in the database rather than an empty string, so the two never both exist for
// the same missing value.
const optionalText = (max: number) =>
  z.string().max(max).nullable().optional().transform((v) => {
    if (v == null) return null
    const trimmed = v.trim()
    return trimmed === '' ? null : trimmed
  })

// A catalogue the supplier publishes: a name, and usually the Google Sheet it
// lives in. The URL is optional so a catalogue can be recorded before anyone has
// found the link for it, but anything typed there has to be a real web address -
// a half-typed one saved silently would only be discovered by clicking it.
const catalogueUrl = z
  .string()
  .max(2000)
  .nullable()
  .optional()
  .transform((v) => (v == null || v.trim() === '' ? null : v.trim()))
  .refine(
    (v) => v == null || /^https?:\/\/\S+$/i.test(v),
    'A catalogue link has to start with http:// or https://',
  )

export const SupplierCatalogueInput = z.object({
  name: z.string().min(1, 'Give the catalogue a name').max(200).transform((v) => v.trim()),
  sheetUrl: catalogueUrl,
})

export const SupplierBody = z.object({
  name: z.string().min(1, 'Give the supplier a name').max(200).transform((v) => v.trim()),
  accountNumber: optionalText(100),
  // null = no discount recorded, which is a different thing from a recorded 0%.
  discountPercent: z
    .number()
    .min(0, 'A discount cannot be negative')
    .max(100, 'A discount cannot be more than 100%')
    .nullable()
    .optional(),
  status: z.enum(['ENABLED', 'DISABLED']).optional(),
  contactName: optionalText(200),
  phone: optionalText(50),
  email: optionalText(200),
  address: optionalText(500),
  notes: optionalText(2000),
  // Absent means "leave the catalogues alone" (an older client, or a caller that
  // only touches contact details); an empty array means "this supplier has none".
  catalogues: z
    .array(SupplierCatalogueInput)
    .max(50, 'That is more catalogues than one supplier is likely to have')
    .optional()
    .superRefine((list, ctx) => {
      if (!list) return
      // Matches the (supplier_id, LOWER(name)) unique index, so the owner gets a
      // sentence rather than a Postgres constraint error.
      const seen = new Set<string>()
      for (const c of list) {
        const key = c.name.toLowerCase()
        if (seen.has(key)) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: `"${c.name}" is listed twice. Catalogue names have to be different.` })
          return
        }
        seen.add(key)
      }
    }),
})
