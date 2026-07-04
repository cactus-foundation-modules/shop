import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireShopUser } from '@/modules/shop/lib/access'
import { listProducts, createProduct, getBackInStockSubscriberCounts } from '@/modules/shop/lib/db'
import { slugify, ensureUniqueProductSlug } from '@/modules/shop/lib/slug'

export async function GET(request: NextRequest) {
  const gate = await requireShopUser('shop.products', { allowAccess: true })
  if (gate.error) return gate.error

  const params = request.nextUrl.searchParams
  const { products, total } = await listProducts({
    status: (params.get('status') as 'DRAFT' | 'ACTIVE' | 'ARCHIVED' | null) ?? undefined,
    type: (params.get('type') as 'PHYSICAL' | 'DIGITAL' | 'SERVICE' | null) ?? undefined,
    search: params.get('search') ?? undefined,
    preOrder: params.get('preOrder') === 'true',
    page: params.get('page') ? Number(params.get('page')) : undefined,
    perPage: params.get('perPage') ? Number(params.get('perPage')) : undefined,
  })
  const subscriberCounts = await getBackInStockSubscriberCounts(products.map((p) => p.id))
  return NextResponse.json({ products, total, subscriberCounts })
}

const Body = z.object({
  name: z.string().min(1),
  type: z.enum(['PHYSICAL', 'DIGITAL', 'SERVICE']),
  status: z.enum(['DRAFT', 'ACTIVE', 'ARCHIVED']).optional(),
  description: z.string().nullable().optional(),
  shortDescription: z.string().nullable().optional(),
  sku: z.string().nullable().optional(),
  barcode: z.string().nullable().optional(),
  price: z.number().nonnegative(),
  compareAtPrice: z.number().nonnegative().nullable().optional(),
  costPrice: z.number().nonnegative().nullable().optional(),
  taxClassId: z.string().nullable().optional(),
  trackInventory: z.boolean().optional(),
  stockCount: z.number().int().nullable().optional(),
  lowStockThreshold: z.number().int().nullable().optional(),
  outOfStockBehaviour: z.enum(['BLOCK', 'BACKORDER']).optional(),
})

export async function POST(request: NextRequest) {
  const gate = await requireShopUser('shop.products')
  if (gate.error) return gate.error

  const parsed = Body.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid product' }, { status: 400 })

  const slug = await ensureUniqueProductSlug(slugify(parsed.data.name))
  const { id } = await createProduct({ ...parsed.data, slug })
  return NextResponse.json({ id, slug }, { status: 201 })
}
