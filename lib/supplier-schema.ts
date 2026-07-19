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
})
