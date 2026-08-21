import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireShopUser } from '@/modules/shop/lib/access'
import { getShopConfigCached } from '@/modules/shop/lib/config'
import { listInvoicesForOrder } from '@/modules/shop/lib/db/invoices'
import { issueInvoiceForOrder, resendInvoiceToSinks, voidInvoiceAndTellSinks } from '@/modules/shop/lib/invoices'
import { hasInvoiceSinks } from '@/modules/shop/lib/invoice-sinks'
import { signInvoiceToken } from '@/modules/shop/lib/invoice-token'
import type { ShpInvoice } from '@/modules/shop/lib/types'

// The order screen's invoice panel: what this order has been invoiced, and the
// three things staff can do about it.
//
// Voiding needs the heavier permission. Raising an invoice is day-to-day order
// work; withdrawing one that has already gone to a customer and into the books
// is not, and a spent number that nobody can explain is exactly the sort of
// thing an audit asks about.

/** The invoice as the admin screen needs it: the document plus the signed link,
 *  which is minted here rather than in the browser because the key that signs it
 *  never leaves the server. */
function present(invoice: ShpInvoice) {
  const token = signInvoiceToken(invoice.invoiceNumber)
  return {
    id: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    orderNumber: invoice.orderNumber,
    status: invoice.status,
    issuedAt: invoice.issuedAt,
    taxPointDate: invoice.taxPointDate,
    dueDate: invoice.dueDate,
    total: invoice.total,
    taxAmount: invoice.taxAmount,
    currencySymbol: invoice.currencySymbol,
    issuedBy: invoice.issuedBy,
    issueTrigger: invoice.issueTrigger,
    sinkResults: invoice.sinkResults,
    voidedAt: invoice.voidedAt,
    voidReason: invoice.voidReason,
    viewUrl: `/shop/invoice/${encodeURIComponent(invoice.invoiceNumber)}?t=${token}`,
    pdfUrl: `/api/m/shop/public/invoices/${encodeURIComponent(invoice.invoiceNumber)}/pdf?t=${token}`,
  }
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireShopUser('shop.orders', { allowAccess: true })
  if (gate.error) return gate.error

  const { id } = await params
  const [invoices, config, sinks] = await Promise.all([
    listInvoicesForOrder(id),
    getShopConfigCached(),
    hasInvoiceSinks(),
  ])

  return NextResponse.json({
    enabled: config.invoicesEnabled,
    issueOn: config.invoiceIssueOn,
    pdfEnabled: config.invoicePdfEnabled,
    // Whether anything is listening for issued invoices at all, so the screen
    // can offer "send to the books again" only where there are books to send to.
    hasBookkeeping: sinks,
    invoices: invoices.map(present),
  })
}

const Body = z.object({
  action: z.enum(['issue', 'resend', 'void']),
  invoiceId: z.string().optional(),
  reason: z.string().max(500).optional(),
})

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireShopUser('shop.orders', { allowAccess: true })
  if (gate.error) return gate.error

  const { id } = await params
  const parsed = Body.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  const { action, invoiceId, reason } = parsed.data

  if (action === 'issue') {
    const outcome = await issueInvoiceForOrder(id, { trigger: 'MANUAL', issuedBy: 'MANUAL', userId: gate.user.id })
    if (!outcome.ok) return NextResponse.json({ error: outcome.error }, { status: outcome.status })
    return NextResponse.json({ invoice: present(outcome.invoice), created: outcome.created })
  }

  if (action === 'resend') {
    if (!invoiceId) return NextResponse.json({ error: 'Which invoice?' }, { status: 400 })
    const outcome = await resendInvoiceToSinks(invoiceId)
    if (!outcome.ok) return NextResponse.json({ error: outcome.error }, { status: outcome.status })
    return NextResponse.json({ invoice: present(outcome.invoice) })
  }

  // Voiding: the heavier permission, and a reason is not optional. An invoice
  // withdrawn without a word beside it is a hole in the numbering that nobody
  // can account for later.
  const voidGate = await requireShopUser('shop.manage')
  if (voidGate.error) return voidGate.error
  if (!invoiceId) return NextResponse.json({ error: 'Which invoice?' }, { status: 400 })
  if (!reason?.trim()) return NextResponse.json({ error: 'Say why this invoice is being voided.' }, { status: 400 })

  // Voiding tells the books as part of the same action - see
  // lib/invoices.ts. What they made of it comes back on the invoice's own sink
  // results, which the panel prints.
  const outcome = await voidInvoiceAndTellSinks(invoiceId, reason)
  if (!outcome.ok) return NextResponse.json({ error: outcome.error }, { status: outcome.status })
  const invoices = await listInvoicesForOrder(id)
  return NextResponse.json({ invoices: invoices.map(present) })
}
