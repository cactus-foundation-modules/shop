import { NextResponse } from 'next/server'
import { z } from 'zod'
import { errorResponse } from '@/lib/utils'
import { requireOrderAccess } from '@/modules/shop/lib/order-route-access'
import { getInvoiceForOrder } from '@/modules/shop/lib/db/invoices'
import { getShopConfigCached } from '@/modules/shop/lib/config'
import {
  BILLING_COMPANY_MAX_LENGTH,
  billingChangeEffect,
  currentBillingIdentity,
  customerCanEditBilling,
  reissueAvailable,
  reissueWarning,
} from '@/modules/shop/lib/customer-billing'
import { changeOrderBillingIdentity } from '@/modules/shop/lib/invoice-reissue'
import { checkInMemoryRateLimit, getClientIpFromRequest } from '@/modules/shop/lib/rate-limit'

// PROTECTED - a customer correcting who their own order is invoiced to. A
// signed-in member, or a guest who has proved the delivery postcode - see
// lib/order-route-access.ts. This is very often the whole reason a guest came
// back at all: the buyer ordered on the company card and their accounts
// department has since told them the invoice needs another name on it.
//
// Its own route rather than another field on the order PATCH beside it, which
// is deliberately the narrowest thing in the module: that one saves a string,
// this one can raise two documents and tell a set of books about both.
//
// Two-phase on purpose. A change that would credit an invoice and replace it
// comes back as `needsConfirmation` with the sentence the customer has to agree
// to, and only a second request carrying `confirm` goes through. The rules
// deciding which is which live in lib/customer-billing.ts and are asked here as
// well as on the page that drew the form - same functions, so a hand-rolled
// request gets the answer a real click would have got.
//
// Nothing here touches the DELIVERY address. Where a parcel goes is not a
// billing question, and a route that moved both would let somebody redirect
// goods that have already been picked.

// The postal address and nothing else. The person's own NAME is deliberately
// not here: the checkout never asks for a billing name, so there is no billing
// name for a customer to be putting right, and a route that accepted one would
// let a hand-rolled request change who an invoice is addressed to while
// pretending to move it. The name, the country and the telephone number are
// carried over from the order below, untouched.
const AddressSchema = z.object({
  line1: z.string().min(1), line2: z.string().optional(),
  city: z.string().min(1), county: z.string().optional(),
  postcode: z.string().min(1),
})

const Body = z.object({
  /** The company the invoice is made out to. Blank clears it, which is how a
   *  private buyer undoes a company typed in by mistake. */
  organisation: z.string().max(BILLING_COMPANY_MAX_LENGTH),
  /** Where the paperwork goes. Null means "the delivery address", which is what
   *  an order with no billing address of its own already means. */
  billingAddress: AddressSchema.nullable(),
  /** Set on the second request, once the customer has been shown what changing
   *  the company on an issued invoice actually does. */
  confirm: z.boolean().optional(),
})

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  // Secondary guard only - the access check below is the real one. Tighter
  // than the reference route's twenty, because one of these can raise two
  // numbered documents.
  if (!checkInMemoryRateLimit(`shop_order_billing:${getClientIpFromRequest(request)}`, 10, 60_000)) {
    return errorResponse('That is a lot of changes at once. Give it a minute.', 429)
  }

  const { id } = await params
  const parsed = Body.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? 'Invalid request')

  const access = await requireOrderAccess(id)
  if (!access.ok) return access.error
  const { order } = access

  const config = await getShopConfigCached()
  const editable = customerCanEditBilling({ config, order })
  if (!editable.allowed) return errorResponse(editable.reason, 409)

  // The address as it stands, which is where the name, the country and the
  // phone come from. On an order that never had a billing address of its own
  // that is the delivery address - the one the invoice is already printing.
  const base = order.billingAddress ?? order.shippingAddress
  const next = {
    organisation: parsed.data.organisation,
    billingAddress: parsed.data.billingAddress
      ? {
          firstName: base.firstName,
          lastName: base.lastName,
          ...parsed.data.billingAddress,
          country: base.country || 'GB',
          ...(base.phone ? { phone: base.phone } : {}),
        }
      : null,
  }
  const invoice = config.invoicesEnabled ? await getInvoiceForOrder(order.id) : null
  const effect = billingChangeEffect(currentBillingIdentity(order), next, invoice)

  // The warning, before anything is written. A company change on an issued
  // invoice is the only thing that gets one, because it is the only one that
  // costs the customer a second piece of paper.
  if (effect.kind === 'reissue' && !parsed.data.confirm) {
    const available = reissueAvailable(config)
    if (!available.allowed) return errorResponse(available.reason, 409)
    return NextResponse.json({
      needsConfirmation: true,
      warning: reissueWarning(invoice!.invoiceNumber, config.invoiceTaxLabel),
    })
  }

  const outcome = await changeOrderBillingIdentity(order.id, next, {
    by: 'CUSTOMER',
    confirmedReissue: parsed.data.confirm === true,
  })
  if (!outcome.ok) return errorResponse(outcome.error, outcome.status)

  return NextResponse.json({
    outcome: outcome.outcome,
    invoiceNumber: outcome.invoice?.invoiceNumber ?? null,
    creditNoteNumber: outcome.creditNote?.creditNoteNumber ?? null,
  })
}
