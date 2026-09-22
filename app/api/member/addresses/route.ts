import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { errorResponse } from '@/lib/utils'
import { getMemberFromCookie } from '@/lib/members/session'
import { listSavedAddresses, createSavedAddress } from '@/modules/shop/lib/db/addresses'
import { BoundedAddressSchema } from '@/modules/shop/lib/address-limits'

// No company field: the organisation a shopper buys on behalf of is a contact
// detail kept on their account, not something repeated on every door they have
// ever ordered to. Rows written before that moved keep theirs in the stored
// JSON; nothing reads it back, and a company that belongs on the delivery label
// goes in line 1.
//
// The address is the shared bounded shape (lib/address-limits.ts) the checkout
// writes, so a saved address is never one the checkout would then refuse, and
// a hand-rolled request cannot park an essay in the address book.
const Body = z.object({ label: z.string().max(60).nullable().optional(), address: BoundedAddressSchema, isDefault: z.boolean().optional() })

export async function GET() {
  const member = await getMemberFromCookie()
  // Quiet, for the same reason the members contact route is: the checkout's
  // delivery block asks this on the way in to find out whether there is an
  // address book to offer, and "no, they are a guest" is the ordinary answer to
  // that question rather than a failure. As a 401 it put a red line in the
  // console of every checkout a shopper ever opened. The writes below keep
  // their 401 - a stranger saving an address IS an error.
  if (!member) return new NextResponse(null, { status: 204 })
  const addresses = await listSavedAddresses(member.id)
  return NextResponse.json({ addresses })
}

export async function POST(request: NextRequest) {
  const member = await getMemberFromCookie()
  if (!member) return errorResponse('Not authenticated', 401)

  const parsed = Body.safeParse(await request.json())
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? 'Invalid address')

  const { id } = await createSavedAddress(member.id, parsed.data.label ?? null, parsed.data.address, parsed.data.isDefault ?? false)
  return NextResponse.json({ id }, { status: 201 })
}
