import { Prisma } from '@prisma/client'
import { prisma, type PrismaTransactionClient } from '@/lib/db/prisma'
import type {
  ShpCreditNote,
  ShpInvoiceCustomer,
  ShpInvoiceLine,
  ShpInvoiceSeller,
  ShpInvoiceSinkResult,
  ShpInvoiceTaxRow,
  ShpInvoiceWording,
} from '@/modules/shop/lib/types'

// The query layer for shp_credit_notes. Deliberately the same shape as
// lib/db/invoices.ts beside it, and deliberately as small.
//
// Two rules carried over, for the same reasons:
//
//  - Nothing UPDATES the money or the snapshots. A credit note is a record of
//    what was sent out. There is no void here at all: an invoice can be voided
//    and reissued because it may be wrong before anyone acts on it, but a credit
//    note follows money that has already gone back to a customer, and money that
//    has moved cannot be un-issued. `sink_results` is the only column that moves
//    after insert, and that is bookkeeping about the document rather than the
//    document.
//
//  - Raising one relies on the partial unique index (one per refund) rather than
//    a read-then-write. The refund route and the retry button on the order
//    screen can genuinely both be in flight.

function decimal(value: unknown): string {
  if (value == null) return '0.00'
  return new Prisma.Decimal(value as Prisma.Decimal.Value).toFixed(2)
}

function dateOnly(value: unknown): string {
  if (!value) return ''
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  return String(value).slice(0, 10)
}

function mapCreditNote(r: Record<string, unknown>): ShpCreditNote {
  return {
    id: r.id as string,
    orderId: r.order_id as string,
    orderNumber: (r.order_number as string) ?? '',
    creditNoteNumber: r.credit_note_number as string,
    invoiceId: (r.invoice_id as string | null) ?? null,
    invoiceNumber: (r.invoice_number as string) ?? '',
    refundId: (r.refund_id as string | null) ?? null,
    issuedAt: r.issued_at as Date,
    taxPointDate: dateOnly(r.tax_point_date),
    currency: r.currency as string,
    currencySymbol: (r.currency_symbol as string) || '£',
    taxMode: r.tax_mode as 'INCLUSIVE' | 'EXCLUSIVE',
    subtotal: decimal(r.subtotal),
    shippingAmount: decimal(r.shipping_amount),
    taxAmount: decimal(r.tax_amount),
    total: decimal(r.total),
    seller: (r.seller ?? {}) as ShpInvoiceSeller,
    customer: (r.customer ?? {}) as ShpInvoiceCustomer,
    lines: (Array.isArray(r.lines) ? r.lines : []) as ShpInvoiceLine[],
    taxBreakdown: (Array.isArray(r.tax_breakdown) ? r.tax_breakdown : []) as ShpInvoiceTaxRow[],
    wording: (r.wording ?? {}) as ShpInvoiceWording,
    reason: (r.reason as string | null) ?? null,
    issuedBy: r.issued_by as 'AUTO' | 'MANUAL',
    createdByUserId: (r.created_by_user_id as string | null) ?? null,
    sinkResults: (Array.isArray(r.sink_results) ? r.sink_results : []) as ShpInvoiceSinkResult[],
    createdAt: r.created_at as Date,
    updatedAt: r.updated_at as Date,
  }
}

/** Every credit note raised against an order, newest first. */
export async function listCreditNotesForOrder(orderId: string): Promise<ShpCreditNote[]> {
  const rows = await prisma.$queryRaw<Record<string, unknown>[]>`
    SELECT * FROM "shp_credit_notes" WHERE "order_id" = ${orderId} ORDER BY "issued_at" DESC
  `
  return rows.map(mapCreditNote)
}

export async function getCreditNoteByNumber(creditNoteNumber: string): Promise<ShpCreditNote | null> {
  const rows = await prisma.$queryRaw<Record<string, unknown>[]>`
    SELECT * FROM "shp_credit_notes" WHERE "credit_note_number" = ${creditNoteNumber} LIMIT 1
  `
  return rows[0] ? mapCreditNote(rows[0]) : null
}

export async function getCreditNoteById(id: string): Promise<ShpCreditNote | null> {
  const rows = await prisma.$queryRaw<Record<string, unknown>[]>`
    SELECT * FROM "shp_credit_notes" WHERE "id" = ${id} LIMIT 1
  `
  return rows[0] ? mapCreditNote(rows[0]) : null
}

/** The credit note already raised for a refund, if there is one. */
export async function getCreditNoteForRefund(refundId: string): Promise<ShpCreditNote | null> {
  const rows = await prisma.$queryRaw<Record<string, unknown>[]>`
    SELECT * FROM "shp_credit_notes" WHERE "refund_id" = ${refundId} LIMIT 1
  `
  return rows[0] ? mapCreditNote(rows[0]) : null
}

export type InsertCreditNoteInput = {
  orderId: string
  orderNumber: string
  creditNoteNumber: string
  invoiceId: string | null
  invoiceNumber: string
  refundId: string | null
  taxPointDate: string
  currency: string
  currencySymbol: string
  taxMode: 'INCLUSIVE' | 'EXCLUSIVE'
  subtotal: string
  shippingAmount: string
  taxAmount: string
  total: string
  seller: ShpInvoiceSeller
  customer: ShpInvoiceCustomer
  lines: ShpInvoiceLine[]
  taxBreakdown: ShpInvoiceTaxRow[]
  wording: ShpInvoiceWording
  reason: string | null
  issuedBy: 'AUTO' | 'MANUAL'
  createdByUserId: string | null
}

/** Thrown when a refund already has its credit note. Not an error worth
 *  shouting about: it is the normal outcome of the refund route and the retry
 *  button both reacting, and the right response is to use the one that is
 *  there. */
export class CreditNoteAlreadyIssuedError extends Error {}

export async function insertCreditNote(
  input: InsertCreditNoteInput,
  tx?: PrismaTransactionClient,
): Promise<ShpCreditNote> {
  try {
    const rows = await (tx ?? prisma).$queryRaw<Record<string, unknown>[]>`
      INSERT INTO "shp_credit_notes" (
        "order_id", "order_number", "credit_note_number", "invoice_id", "invoice_number", "refund_id",
        "tax_point_date", "currency", "currency_symbol", "tax_mode",
        "subtotal", "shipping_amount", "tax_amount", "total",
        "seller", "customer", "lines", "tax_breakdown", "wording",
        "reason", "issued_by", "created_by_user_id"
      ) VALUES (
        ${input.orderId}, ${input.orderNumber}, ${input.creditNoteNumber}, ${input.invoiceId},
        ${input.invoiceNumber}, ${input.refundId},
        ${input.taxPointDate}::date, ${input.currency}, ${input.currencySymbol}, ${input.taxMode},
        ${input.subtotal}::numeric, ${input.shippingAmount}::numeric,
        ${input.taxAmount}::numeric, ${input.total}::numeric,
        ${JSON.stringify(input.seller)}::jsonb, ${JSON.stringify(input.customer)}::jsonb,
        ${JSON.stringify(input.lines)}::jsonb, ${JSON.stringify(input.taxBreakdown)}::jsonb,
        ${JSON.stringify(input.wording)}::jsonb,
        ${input.reason}, ${input.issuedBy}, ${input.createdByUserId}
      )
      RETURNING *
    `
    return mapCreditNote(rows[0]!)
  } catch (error) {
    // 23505 is the partial unique index doing its job - somebody else credited
    // this refund between our check and our insert.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2010') {
      const meta = error.meta as { code?: string } | undefined
      if (meta?.code === '23505') throw new CreditNoteAlreadyIssuedError('This refund already has a credit note.')
    }
    if (String((error as { message?: string }).message ?? '').includes('shp_credit_notes_refund_key')) {
      throw new CreditNoteAlreadyIssuedError('This refund already has a credit note.')
    }
    throw error
  }
}

/** Records what the bookkeeping sinks made of a credit note. Replaces the list
 *  outright rather than appending, exactly as the invoice's does. */
export async function saveCreditNoteSinkResults(creditNoteId: string, results: ShpInvoiceSinkResult[]): Promise<void> {
  await prisma.$executeRaw`
    UPDATE "shp_credit_notes"
    SET "sink_results" = ${JSON.stringify(results)}::jsonb, "updated_at" = CURRENT_TIMESTAMP
    WHERE "id" = ${creditNoteId}
  `
}
