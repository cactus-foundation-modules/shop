// The box list (migration 074) as it comes back out of the database. Apart from
// lib/consignment-parcels.ts so the schema library stays out of the client
// bundles that only need the type and the wording.

import { z } from 'zod'
import type { ConsignmentParcel } from '@/modules/shop/lib/consignment-parcels'

const consignmentParcelSchema: z.ZodType<ConsignmentParcel> = z.object({
  code: z.string(),
  number: z.string(),
  shortCode: z.string().nullable(),
  stage: z.string().nullable(),
  delivered: z.boolean(),
  deliveredAt: z.string().nullable(),
  receivedBy: z.string().nullable(),
  photoUrl: z.string().nullable(),
  photoKey: z.string().nullable(),
  photoRef: z.string().nullable(),
  checkedAt: z.string().nullable(),
})

/** The list as it comes back out of the database: checked rather than cast,
 *  because a jsonb column is data of unknown shape whoever wrote it. A row that
 *  does not parse reads as "never asked", and the next tracking check asks. */
export function parseConsignmentParcels(value: unknown): ConsignmentParcel[] | null {
  if (value === null || value === undefined) return null
  const parsed = z.array(consignmentParcelSchema).safeParse(value)
  return parsed.success ? parsed.data : null
}

