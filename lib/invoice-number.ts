import { prisma } from '@/lib/db/prisma'
import { getShopConfigCached } from '@/modules/shop/lib/config'

// Atomic - backed by a Postgres sequence (shp_invoice_number_seq), exactly as
// order numbers are. Two orders reaching the same status in the same second
// must never be handed the same invoice number: HMRC expects invoice numbers to
// be unique and in sequence, and a duplicate is the kind of thing an accountant
// finds in January.
//
// The prefix is a setting and the number is not. Changing the prefix changes
// what future invoices are called; nothing renumbers, because renumbering
// issued invoices is not a thing a shop may do.
export async function generateInvoiceNumber(): Promise<string> {
  const config = await getShopConfigCached()
  const rows = await prisma.$queryRaw<{ nextval: bigint }[]>`
    SELECT nextval('shp_invoice_number_seq') AS nextval
  `
  const seq = rows[0]!.nextval.toString().padStart(6, '0')
  return `${config.invoiceNumberPrefix}${seq}`
}
