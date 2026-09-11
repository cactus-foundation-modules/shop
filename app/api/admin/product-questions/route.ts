import { NextRequest, NextResponse } from 'next/server'
import { requireShopUser } from '@/modules/shop/lib/access'
import { listProductQuestions } from '@/modules/shop/lib/db/product-questions'
import type { ShpProductQuestionStatus } from '@/modules/shop/lib/types'

const STATUSES = ['PENDING', 'ANSWERED', 'REJECTED'] as const

// The admin queue for "Ask a question" (migration 056). Read-only; answering and
// binning are on [id].
export async function GET(request: NextRequest) {
  // Same permission as the rest of the catalogue: whoever edits products answers
  // questions about them.
  const gate = await requireShopUser('shop.products', { allowAccess: true })
  if (gate.error) return gate.error

  const params = request.nextUrl.searchParams
  const raw = params.get('status')
  // Anything unrecognised is treated as "all", not as an error: this value comes
  // off a query string somebody may well have typed.
  const status = (STATUSES as readonly string[]).includes(raw ?? '')
    ? (raw as ShpProductQuestionStatus)
    : 'ALL'

  const result = await listProductQuestions({
    status,
    productId: params.get('productId') ?? undefined,
    page: Number(params.get('page')) || 1,
    perPage: Number(params.get('perPage')) || 25,
  })
  return NextResponse.json(result)
}
