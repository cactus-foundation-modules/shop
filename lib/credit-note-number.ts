import { prisma } from '@/lib/db/prisma'
import { getShopConfigCached } from '@/modules/shop/lib/config'

// Atomic - backed by its own Postgres sequence (shp_credit_note_number_seq),
// exactly as invoice and order numbers are.
//
// Its own sequence, and never the invoice one. Credit notes are a separate run
// of documents: an accountant reading a gap in the invoice numbering deserves a
// better answer than "one of those was a refund", and HMRC expects each run to
// be unique and in sequence on its own terms.
export async function generateCreditNoteNumber(): Promise<string> {
  const config = await getShopConfigCached()
  const rows = await prisma.$queryRaw<{ nextval: bigint }[]>`
    SELECT nextval('shp_credit_note_number_seq') AS nextval
  `
  const seq = rows[0]!.nextval.toString().padStart(6, '0')
  return `${config.creditNoteNumberPrefix}${seq}`
}
