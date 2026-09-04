import { Prisma } from '@prisma/client'
import { prisma, type PrismaTransactionClient } from '@/lib/db/prisma'
import type {
  ShpInvoice,
  ShpInvoiceCustomer,
  ShpInvoiceCustomerAmendment,
  ShpInvoiceLine,
  ShpInvoiceSeller,
  ShpInvoiceSinkResult,
  ShpInvoiceStatus,
  ShpInvoiceTaxRow,
  ShpInvoiceWording,
} from '@/modules/shop/lib/types'

// The query layer for shp_invoices.
//
// Two things here are deliberate and worth keeping:
//
//  - Nothing UPDATES the money, the snapshots or the number. An invoice is a
//    record of what was sent out; a wrong one is voided and reissued. The only
//    columns that ever move after insert are the void pair and sink_results,
//    which is bookkeeping about the invoice rather than the invoice itself.
//
//    One exception, added deliberately and kept as narrow as it will go:
//    amendInvoiceBillingAddress moves the POSTAL ADDRESS the document is sent
//    to, and records what it said before in customer_amendments. Nothing else
//    it touches - not the name, not a figure, not a date, not the number. The
//    party being billed is unchanged by a move of office, so no number is burnt
//    and no return is reopened; a change of the party itself is a credit note
//    and a replacement, which is lib/invoice-reissue.ts and not an edit at all.
//
//  - Issuing relies on the partial unique index (one ISSUED row per order)
//    rather than a read-then-write. Two callers can genuinely race here: the
//    order screen and the bulk status bar both change status, and both react.

function decimal(value: unknown): string {
  if (value == null) return '0.00'
  return new Prisma.Decimal(value as Prisma.Decimal.Value).toFixed(2)
}

/** A DATE column comes back as a Date at UTC midnight; the invoice carries it as
 *  a plain yyyy-mm-dd, because a tax point is a day and not an instant. */
function dateOnly(value: unknown): string | null {
  if (!value) return null
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  return String(value).slice(0, 10)
}

function mapInvoice(r: Record<string, unknown>): ShpInvoice {
  return {
    id: r.id as string,
    orderId: r.order_id as string,
    orderNumber: (r.order_number as string) ?? '',
    invoiceNumber: r.invoice_number as string,
    status: r.status as ShpInvoiceStatus,
    issuedAt: r.issued_at as Date,
    taxPointDate: dateOnly(r.tax_point_date) ?? '',
    dueDate: dateOnly(r.due_date),
    currency: r.currency as string,
    currencySymbol: (r.currency_symbol as string) || '£',
    taxMode: r.tax_mode as 'INCLUSIVE' | 'EXCLUSIVE',
    subtotal: decimal(r.subtotal),
    discountAmount: decimal(r.discount_amount),
    shippingAmount: decimal(r.shipping_amount),
    taxAmount: decimal(r.tax_amount),
    total: decimal(r.total),
    seller: (r.seller ?? {}) as ShpInvoiceSeller,
    customer: (r.customer ?? {}) as ShpInvoiceCustomer,
    lines: (Array.isArray(r.lines) ? r.lines : []) as ShpInvoiceLine[],
    taxBreakdown: (Array.isArray(r.tax_breakdown) ? r.tax_breakdown : []) as ShpInvoiceTaxRow[],
    wording: (r.wording ?? {}) as ShpInvoiceWording,
    issuedBy: r.issued_by as 'AUTO' | 'MANUAL',
    issueTrigger: (r.issue_trigger as string | null) ?? null,
    createdByUserId: (r.created_by_user_id as string | null) ?? null,
    sinkResults: (Array.isArray(r.sink_results) ? r.sink_results : []) as ShpInvoiceSinkResult[],
    customerAmendments: (Array.isArray(r.customer_amendments) ? r.customer_amendments : []) as ShpInvoiceCustomerAmendment[],
    supersededAt: (r.superseded_at as Date | null) ?? null,
    supersededByInvoiceId: (r.superseded_by_invoice_id as string | null) ?? null,
    supersedeReason: (r.supersede_reason as string | null) ?? null,
    voidedAt: (r.voided_at as Date | null) ?? null,
    voidReason: (r.void_reason as string | null) ?? null,
    createdAt: r.created_at as Date,
    updatedAt: r.updated_at as Date,
  }
}

/** The live invoice for an order, if it has one.
 *
 *  Neither a voided one nor a superseded one is it. Superseded means the
 *  company being billed changed: the document was credited in full and a fresh
 *  one raised, and it is the fresh one every caller here means by "the invoice"
 *  - the one to attach to an email, to credit against a refund, to link from
 *  the order page. The old one is still readable at its own number, which is
 *  the whole reason it was superseded rather than voided. */
export async function getInvoiceForOrder(orderId: string): Promise<ShpInvoice | null> {
  const rows = await prisma.$queryRaw<Record<string, unknown>[]>`
    SELECT * FROM "shp_invoices"
    WHERE "order_id" = ${orderId} AND "status" = 'ISSUED' AND "superseded_at" IS NULL
    LIMIT 1
  `
  return rows[0] ? mapInvoice(rows[0]) : null
}

/** Every invoice ever raised against an order, newest first - voided ones
 *  included, because "why are there two" is a question with an answer. */
export async function listInvoicesForOrder(orderId: string): Promise<ShpInvoice[]> {
  const rows = await prisma.$queryRaw<Record<string, unknown>[]>`
    SELECT * FROM "shp_invoices" WHERE "order_id" = ${orderId} ORDER BY "issued_at" DESC
  `
  return rows.map(mapInvoice)
}

export async function getInvoiceByNumber(invoiceNumber: string): Promise<ShpInvoice | null> {
  const rows = await prisma.$queryRaw<Record<string, unknown>[]>`
    SELECT * FROM "shp_invoices" WHERE "invoice_number" = ${invoiceNumber} LIMIT 1
  `
  return rows[0] ? mapInvoice(rows[0]) : null
}

export async function getInvoiceById(id: string): Promise<ShpInvoice | null> {
  const rows = await prisma.$queryRaw<Record<string, unknown>[]>`
    SELECT * FROM "shp_invoices" WHERE "id" = ${id} LIMIT 1
  `
  return rows[0] ? mapInvoice(rows[0]) : null
}

export type InsertInvoiceInput = {
  orderId: string
  orderNumber: string
  invoiceNumber: string
  taxPointDate: string
  dueDate: string | null
  currency: string
  currencySymbol: string
  taxMode: 'INCLUSIVE' | 'EXCLUSIVE'
  subtotal: string
  discountAmount: string
  shippingAmount: string
  taxAmount: string
  total: string
  seller: ShpInvoiceSeller
  customer: ShpInvoiceCustomer
  lines: ShpInvoiceLine[]
  taxBreakdown: ShpInvoiceTaxRow[]
  wording: ShpInvoiceWording
  issuedBy: 'AUTO' | 'MANUAL'
  issueTrigger: string | null
  createdByUserId: string | null
}

/** Thrown when an order already has a live invoice. Not an error the caller has
 *  to shout about: it is the normal outcome of two things reacting to the same
 *  status change, and the right response is to use the invoice that is there. */
export class InvoiceAlreadyIssuedError extends Error {}

export async function insertInvoice(input: InsertInvoiceInput, tx?: PrismaTransactionClient): Promise<ShpInvoice> {
  try {
    const rows = await (tx ?? prisma).$queryRaw<Record<string, unknown>[]>`
      INSERT INTO "shp_invoices" (
        "order_id", "order_number", "invoice_number", "tax_point_date", "due_date", "currency", "currency_symbol",
        "tax_mode", "subtotal", "discount_amount", "shipping_amount", "tax_amount", "total",
        "seller", "customer", "lines", "tax_breakdown", "wording",
        "issued_by", "issue_trigger", "created_by_user_id"
      ) VALUES (
        ${input.orderId}, ${input.orderNumber}, ${input.invoiceNumber}, ${input.taxPointDate}::date, ${input.dueDate}::date,
        ${input.currency}, ${input.currencySymbol}, ${input.taxMode},
        ${input.subtotal}::numeric, ${input.discountAmount}::numeric, ${input.shippingAmount}::numeric,
        ${input.taxAmount}::numeric, ${input.total}::numeric,
        ${JSON.stringify(input.seller)}::jsonb, ${JSON.stringify(input.customer)}::jsonb,
        ${JSON.stringify(input.lines)}::jsonb, ${JSON.stringify(input.taxBreakdown)}::jsonb,
        ${JSON.stringify(input.wording)}::jsonb,
        ${input.issuedBy}, ${input.issueTrigger}, ${input.createdByUserId}
      )
      RETURNING *
    `
    return mapInvoice(rows[0]!)
  } catch (error) {
    // 23505 is the partial unique index doing its job - somebody else invoiced
    // this order between our check and our insert.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2010') {
      const meta = error.meta as { code?: string } | undefined
      if (meta?.code === '23505') throw new InvoiceAlreadyIssuedError('This order already has an invoice.')
    }
    // Both names: the index was renamed when superseding arrived (migration
    // 036), and an install that has not taken that migration yet still reports
    // the old one.
    const message = String((error as { message?: string }).message ?? '')
    if (message.includes('shp_invoices_order_live_key') || message.includes('shp_invoices_order_issued_key')) {
      throw new InvoiceAlreadyIssuedError('This order already has an invoice.')
    }
    throw error
  }
}

/** Records what the bookkeeping sinks made of an invoice. Replaces the list
 *  outright rather than appending: a re-run is a fresh answer to the same
 *  question, and a growing log of every attempt belongs nowhere near a document. */
export async function saveSinkResults(invoiceId: string, results: ShpInvoiceSinkResult[]): Promise<void> {
  await prisma.$executeRaw`
    UPDATE "shp_invoices"
    SET "sink_results" = ${JSON.stringify(results)}::jsonb, "updated_at" = CURRENT_TIMESTAMP
    WHERE "id" = ${invoiceId}
  `
}

/** Voids an invoice. Never deletes: the number stays spent and the document
 *  stays readable, which is the whole point of voiding rather than removing. */
export async function voidInvoice(invoiceId: string, reason: string): Promise<boolean> {
  const count = await prisma.$executeRaw`
    UPDATE "shp_invoices"
    SET "status" = 'VOID', "voided_at" = CURRENT_TIMESTAMP,
        "void_reason" = ${reason.trim() || null}, "updated_at" = CURRENT_TIMESTAMP
    WHERE "id" = ${invoiceId} AND "status" = 'ISSUED'
  `
  return count > 0
}

/**
 * Corrects the billing ADDRESS printed on an issued invoice, keeping what it
 * said before.
 *
 * The one thing in this file that edits a snapshot, and the reasoning is on the
 * header. A company that has moved office is the same party, being billed for
 * the same supply, on the same tax point - nothing about the sale has changed,
 * so crediting the invoice and burning a number to reprint an identical
 * document with a different postcode on it would be paperwork for its own sake.
 *
 * Name changes do not come through here. They are a different party, and
 * lib/invoice-reissue.ts is what handles those.
 *
 * One statement, so the history and the value can never disagree: the address
 * being replaced is read out of the row inside the same UPDATE rather than
 * passed in by a caller who read it a moment ago.
 */
export async function amendInvoiceBillingAddress(
  invoiceId: string,
  lines: string[],
  by: 'CUSTOMER' | 'STAFF',
  tx?: PrismaTransactionClient,
): Promise<boolean> {
  const count = await (tx ?? prisma).$executeRaw`
    UPDATE "shp_invoices"
    SET "customer" = jsonb_set(
          COALESCE("customer", '{}'::jsonb), '{billingAddress}', ${JSON.stringify(lines)}::jsonb, true
        ),
        "customer_amendments" = COALESCE("customer_amendments", '[]'::jsonb) || jsonb_build_object(
          'at', to_char(CURRENT_TIMESTAMP AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
          'by', ${by},
          'field', 'billingAddress',
          'was', COALESCE("customer"->'billingAddress', '[]'::jsonb),
          'now', ${JSON.stringify(lines)}::jsonb
        ),
        "updated_at" = CURRENT_TIMESTAMP
    WHERE "id" = ${invoiceId} AND "status" = 'ISSUED' AND "superseded_at" IS NULL
  `
  return count > 0
}

/**
 * Marks an invoice as credited-and-replaced, freeing the order to be invoiced
 * again.
 *
 * Guarded on being live, so two people pressing at once cannot both go on to
 * raise a replacement: the second UPDATE matches nothing and its caller stops.
 * The link to the replacement is set afterwards by linkSupersedingInvoice -
 * the new invoice does not exist yet at this point, which is exactly the
 * ordering the unique index forces.
 */
export async function supersedeInvoice(
  invoiceId: string,
  reason: string,
  tx?: PrismaTransactionClient,
): Promise<boolean> {
  const count = await (tx ?? prisma).$executeRaw`
    UPDATE "shp_invoices"
    SET "superseded_at" = CURRENT_TIMESTAMP,
        "supersede_reason" = ${reason.trim() || null},
        "updated_at" = CURRENT_TIMESTAMP
    WHERE "id" = ${invoiceId} AND "status" = 'ISSUED' AND "superseded_at" IS NULL
  `
  return count > 0
}

/** Points a superseded invoice at the one that replaced it, so "why are there
 *  two" has an answer on the row rather than in somebody's memory. */
export async function linkSupersedingInvoice(
  supersededId: string,
  replacementId: string,
  tx?: PrismaTransactionClient,
): Promise<void> {
  await (tx ?? prisma).$executeRaw`
    UPDATE "shp_invoices"
    SET "superseded_by_invoice_id" = ${replacementId}, "updated_at" = CURRENT_TIMESTAMP
    WHERE "id" = ${supersededId}
  `
}
