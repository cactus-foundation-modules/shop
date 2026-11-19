import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireShopUser } from '@/modules/shop/lib/access'
import { requestIssuePhotos } from '@/modules/shop/lib/issue-photo-actions'

const Body = z.object({
  // What the shop needs to see - "the label on the end of the box", "the
  // underside of the top". Optional: "a few photographs" is a fair ask too.
  note: z.string().max(1000).nullable().optional(),
})

// PROTECTED - ask the customer for photographs on an open issue report. Emails
// them (shop.issue-photos-requested, editable under Settings > Emails) with a
// link straight to the report's upload form, or the option to reply with them
// attached.
//
// A 200 with `emailError` set means the ask is recorded and shows on their order
// page, but the email did not go - said plainly so staff can chase it another way.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireShopUser('shop.orders')
  if (gate.error) return gate.error

  const { id } = await params
  const parsed = Body.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' }, { status: 400 })
  }

  const outcome = await requestIssuePhotos({ requestId: id, note: parsed.data.note ?? null, userId: gate.user.id })
  if (!outcome.ok) return NextResponse.json({ error: outcome.error }, { status: outcome.status })
  return NextResponse.json({ ok: true, emailError: outcome.emailError })
}
