import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { listProducts } from '@/modules/shop/lib/db'
import { shopClosedResponse } from '@/modules/shop/lib/access'
import { checkInMemoryRateLimit } from '@/modules/shop/lib/rate-limit'
import { getClientIp } from '@/lib/auth/rate-limit'

// Nothing on the storefront calls this list - every grid, category page and
// search result is drawn on the server - so what arrives here is a script, and
// a search costs a handful of ILIKEs plus a COUNT over the whole catalogue. The
// ceiling is generous for anyone reading the list on purpose; it is here to
// stop one address running the search in a loop, the same job the cart routes'
// limits do.
const LIST_REQUESTS_PER_MINUTE = 60
// Room for any real search box entry - eight words of a product name and a
// code or two. A pasted page of text is not a search.
const SEARCH_MAX_LENGTH = 200

const Query = z.object({
  // Checked rather than cast: an unknown type used to reach Postgres as an enum
  // value it could not parse, and came back as a 500.
  type: z.enum(['PHYSICAL', 'DIGITAL', 'SERVICE']).optional(),
  search: z.string().max(SEARCH_MAX_LENGTH, `Please keep the search under ${SEARCH_MAX_LENGTH} characters.`).optional(),
})

export async function GET(request: NextRequest) {
  if (!checkInMemoryRateLimit(`shop_public_products:${await getClientIp(request)}`, LIST_REQUESTS_PER_MINUTE, 60_000)) {
    return NextResponse.json({ error: 'Too many requests - please wait a moment and try again.' }, { status: 429 })
  }
  const closed = await shopClosedResponse()
  if (closed) return closed

  const params = request.nextUrl.searchParams
  const query = Query.safeParse({
    type: params.get('type') ?? undefined,
    search: params.get('search') ?? undefined,
  })
  if (!query.success) {
    const issue = query.error.issues[0]
    return NextResponse.json({ error: issue?.path[0] === 'search' ? issue.message : 'Unknown product type.' }, { status: 400 })
  }
  const { products, total } = await listProducts({
    status: 'ACTIVE',
    type: query.data.type,
    categorySlug: params.get('category') ?? undefined,
    tagSlug: params.get('tag') ?? undefined,
    collectionSlug: params.get('collection') ?? undefined,
    search: query.data.search,
    page: params.get('page') ? Number(params.get('page')) : undefined,
    perPage: params.get('perPage') ? Number(params.get('perPage')) : undefined,
    excludeHidden: true,
    storefront: true,
  })
  return NextResponse.json({ products, total })
}
