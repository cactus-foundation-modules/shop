import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { errorResponse } from '@/lib/utils'
import { getMemberFromCookie } from '@/lib/members/session'
import { listSavedAddresses, createSavedAddress } from '@/modules/shop/lib/db/addresses'

const AddressSchema = z.object({
  firstName: z.string().min(1), lastName: z.string().min(1), company: z.string().optional(),
  line1: z.string().min(1), line2: z.string().optional(), city: z.string().min(1), county: z.string().optional(),
  postcode: z.string().min(1), country: z.string().min(2).default('GB'), phone: z.string().optional(),
})
const Body = z.object({ label: z.string().max(60).nullable().optional(), address: AddressSchema, isDefault: z.boolean().optional() })

export async function GET() {
  const member = await getMemberFromCookie()
  if (!member) return errorResponse('Not authenticated', 401)
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
