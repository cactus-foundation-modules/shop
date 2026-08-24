import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { errorResponse } from '@/lib/utils'
import { getMemberFromCookie } from '@/lib/members/session'
import { updateSavedAddress, deleteSavedAddress, getSavedAddressById } from '@/modules/shop/lib/db/addresses'

// No company field: the organisation a shopper buys on behalf of is a contact
// detail kept on their account, not something repeated on every door they have
// ever ordered to. Rows written before that moved keep theirs in the stored
// JSON; nothing reads it back, and a company that belongs on the delivery label
// goes in line 1.
const AddressSchema = z.object({
  firstName: z.string().min(1), lastName: z.string().min(1),
  line1: z.string().min(1), line2: z.string().optional(), city: z.string().min(1), county: z.string().optional(),
  postcode: z.string().min(1), country: z.string().min(2).default('GB'), phone: z.string().optional(),
})
const Body = z.object({ label: z.string().max(60).nullable().optional(), address: AddressSchema.optional(), isDefault: z.boolean().optional() })

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const member = await getMemberFromCookie()
  if (!member) return errorResponse('Not authenticated', 401)

  const { id } = await params
  const existing = await getSavedAddressById(id, member.id)
  if (!existing) return errorResponse('Address not found', 404)

  const parsed = Body.safeParse(await request.json())
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? 'Invalid address')

  await updateSavedAddress(id, member.id, parsed.data)
  return NextResponse.json({ success: true })
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const member = await getMemberFromCookie()
  if (!member) return errorResponse('Not authenticated', 401)
  const { id } = await params
  await deleteSavedAddress(id, member.id)
  return NextResponse.json({ success: true })
}
