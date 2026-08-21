import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireShopUser } from '@/modules/shop/lib/access'
import { getShopConfigCached } from '@/modules/shop/lib/config'
import { listCreditNotesForOrder } from '@/modules/shop/lib/db/credit-notes'
import { issueCreditNoteForRefund, resendCreditNoteToSinks } from '@/modules/shop/lib/credit-notes'
import { hasCreditSinks } from '@/modules/shop/lib/invoice-sinks'
import { signCreditNoteToken } from '@/modules/shop/lib/invoice-token'
import type { ShpCreditNote } from '@/modules/shop/lib/types'

// The order screen's credit note panel: what has been credited back against this
// order, and the two things staff can do about it.
//
// No void here, and none coming. An invoice can be withdrawn because it may be
// wrong before anybody acts on it; a credit note follows money that has already
// left the shop's account and arrived in a customer's, and there is no document
// that un-does that. A credit note raised in error is corrected by invoicing
// again, which is the same answer an accountant would give.

/** The credit note as the admin screen needs it, signed link and all. */
function present(note: ShpCreditNote) {
  const token = signCreditNoteToken(note.creditNoteNumber)
  return {
    id: note.id,
    creditNoteNumber: note.creditNoteNumber,
    invoiceNumber: note.invoiceNumber,
    orderNumber: note.orderNumber,
    refundId: note.refundId,
    issuedAt: note.issuedAt,
    taxPointDate: note.taxPointDate,
    total: note.total,
    taxAmount: note.taxAmount,
    currencySymbol: note.currencySymbol,
    reason: note.reason,
    issuedBy: note.issuedBy,
    sinkResults: note.sinkResults,
    viewUrl: `/shop/credit-note/${encodeURIComponent(note.creditNoteNumber)}?t=${token}`,
    pdfUrl: `/api/m/shop/public/credit-notes/${encodeURIComponent(note.creditNoteNumber)}/pdf?t=${token}`,
  }
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireShopUser('shop.orders', { allowAccess: true })
  if (gate.error) return gate.error

  const { id } = await params
  const [notes, config, sinks] = await Promise.all([
    listCreditNotesForOrder(id),
    getShopConfigCached(),
    hasCreditSinks(),
  ])

  return NextResponse.json({
    enabled: config.invoicesEnabled && config.creditNotesEnabled,
    pdfEnabled: config.invoicePdfEnabled,
    hasBookkeeping: sinks,
    creditNotes: notes.map(present),
  })
}

const Body = z.object({
  action: z.enum(['issue', 'resend']),
  /** For `issue`: the settled refund that never got its document. */
  refundId: z.string().optional(),
  /** For `resend`: which credit note to hand to the books again. */
  creditNoteId: z.string().optional(),
})

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireShopUser('shop.orders', { allowAccess: true })
  if (gate.error) return gate.error

  await params
  const parsed = Body.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  const { action, refundId, creditNoteId } = parsed.data

  // Raising one by hand, for a refund that settled while credit notes were off,
  // or one the automatic attempt could not work out at the time. Idempotent on
  // the refund, so pressing it twice is not two credit notes.
  if (action === 'issue') {
    if (!refundId) return NextResponse.json({ error: 'Which refund?' }, { status: 400 })
    const outcome = await issueCreditNoteForRefund(refundId, { issuedBy: 'MANUAL', userId: gate.user.id })
    if (!outcome.ok) return NextResponse.json({ error: outcome.error }, { status: outcome.status })
    return NextResponse.json({ creditNote: present(outcome.creditNote), created: outcome.created })
  }

  if (!creditNoteId) return NextResponse.json({ error: 'Which credit note?' }, { status: 400 })
  const outcome = await resendCreditNoteToSinks(creditNoteId)
  if (!outcome.ok) return NextResponse.json({ error: outcome.error }, { status: outcome.status })
  return NextResponse.json({ creditNote: present(outcome.creditNote) })
}
