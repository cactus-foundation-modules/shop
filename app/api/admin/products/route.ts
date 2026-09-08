import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { requireShopUser } from '@/modules/shop/lib/access'
import { listProducts, createProduct, getBackInStockSubscriberCounts, getPrimaryProductImages } from '@/modules/shop/lib/db'
import type { ProductSort, ProductStockFilter } from '@/modules/shop/lib/db'
import { slugify, ensureUniqueProductSlug } from '@/modules/shop/lib/slug'

const SORTS: ProductSort[] = ['newest', 'oldest', 'name-asc', 'name-desc', 'price-asc', 'price-desc', 'stock-asc', 'stock-desc', 'popular']
const STOCKS: ProductStockFilter[] = ['in', 'low', 'out']

export async function GET(request: NextRequest) {
  const gate = await requireShopUser('shop.products', { allowAccess: true })
  if (gate.error) return gate.error

  const params = request.nextUrl.searchParams
  const sortParam = params.get('sort')
  const stockParam = params.get('stock')
  const { products, total } = await listProducts({
    status: (params.get('status') as 'DRAFT' | 'ACTIVE' | 'ARCHIVED' | null) ?? undefined,
    type: (params.get('type') as 'PHYSICAL' | 'DIGITAL' | 'SERVICE' | null) ?? undefined,
    search: params.get('search') ?? undefined,
    preOrder: params.get('preOrder') === 'true',
    stock: STOCKS.includes(stockParam as ProductStockFilter) ? (stockParam as ProductStockFilter) : undefined,
    sort: SORTS.includes(sortParam as ProductSort) ? (sortParam as ProductSort) : undefined,
    page: params.get('page') ? Number(params.get('page')) : undefined,
    perPage: params.get('perPage') ? Number(params.get('perPage')) : undefined,
    // Variant child products are managed under Product options, not here.
    excludeHidden: true,
  })
  const ids = products.map((p) => p.id)
  const [subscriberCounts, images] = await Promise.all([
    getBackInStockSubscriberCounts(ids),
    getPrimaryProductImages(ids),
  ])
  return NextResponse.json({ products, total, subscriberCounts, images })
}

const Body = z.object({
  name: z.string().min(1),
  type: z.enum(['PHYSICAL', 'DIGITAL', 'SERVICE']),
  status: z.enum(['DRAFT', 'ACTIVE', 'ARCHIVED']).optional(),
  description: z.string().nullable().optional(),
  shortDescription: z.string().nullable().optional(),
  sku: z.string().nullable().optional(),
  saleSku: z.string().nullable().optional(),
  supplierSku: z.string().nullable().optional(),
  barcode: z.string().nullable().optional(),
  supplier: z.string().nullable().optional(),
  price: z.number().nonnegative(),
  salePrice: z.number().nonnegative().nullable().optional(),
  retailPrice: z.number().nonnegative().nullable().optional(),
  tradePrice: z.number().nonnegative().nullable().optional(),
  costPrice: z.number().nonnegative().nullable().optional(),
  taxClassId: z.string().nullable().optional(),
  trackInventory: z.boolean().optional(),
  stockCount: z.number().int().nullable().optional(),
  lowStockThreshold: z.number().int().nullable().optional(),
  outOfStockBehaviour: z.enum(['BLOCK', 'BACKORDER']).optional(),
  minOrderQuantity: z.number().int().nullable().optional(),
  // An amount PER UNIT already inside this line's price, which comes back off
  // once the basket holds enough of its supplier's goods. Null clears it, and a
  // 0 is normalised to null on the way in - a recorded nothing and a blank
  // behave identically, so only one of them is worth storing.
  orderSizeDeduction: z.number().nonnegative().nullable().optional(),
  // Whether the shop takes this one back. Null - the usual state - is "nothing
  // said", which reads as returnable and lets a shop-variations child fall back
  // to its listing; only an explicit false refuses. See lib/returnable.ts.
  returnable: z.boolean().nullable().optional(),
  // Whether taking it back is a favour rather than a right. Null is "nothing
  // said" on the same terms, and it is only ever read where returns are allowed
  // at all - see lib/returnable.ts.
  returnsDiscretionary: z.boolean().nullable().optional(),
  nonReturnableNote: z.string().max(300).nullable().optional(),
  featuredHidden: z.boolean().optional(),
})

export async function POST(request: NextRequest) {
  const gate = await requireShopUser('shop.products')
  if (gate.error) return gate.error

  const parsed = Body.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid product' }, { status: 400 })

  const slug = await ensureUniqueProductSlug(slugify(parsed.data.name))
  try {
    const { id } = await createProduct({ ...parsed.data, slug })
    return NextResponse.json({ id, slug }, { status: 201 })
  } catch (err) {
    const isUniqueViolation = err instanceof Prisma.PrismaClientKnownRequestError
      && (err.code === 'P2002' || (err.code === 'P2010' && String(err.meta?.message ?? '').includes('unique constraint')))
    if (isUniqueViolation) {
      return NextResponse.json({ error: 'That SKU is already used by another product.' }, { status: 409 })
    }
    throw err
  }
}
