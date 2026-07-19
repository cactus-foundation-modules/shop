import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { requireShopUser } from '@/modules/shop/lib/access'
import {
  getProductById, updateProduct, deleteProduct, getProductMedia, getProductCategoryIds, getProductTagIds, getProductCollectionIds,
  setProductMedia, setProductCategories, setProductTags, setProductCollections,
  getManualRelatedProducts, getManualUpsellProducts, getAutoExcludedIds,
} from '@/modules/shop/lib/db'
import { slugify, ensureUniqueProductSlug } from '@/modules/shop/lib/slug'
import { maybeTriggerBackInStock } from '@/modules/shop/lib/back-in-stock-trigger'
import { reorganiseProductMedia } from '@/modules/shop/lib/media/product-media'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireShopUser('shop.products', { allowAccess: true })
  if (gate.error) return gate.error

  const { id } = await params
  const product = await getProductById(id)
  if (!product) return NextResponse.json({ error: 'Product not found' }, { status: 404 })

  const [media, categoryIds, tagIds, collectionIds, relatedProducts, upsellProducts, excludedIds] = await Promise.all([
    getProductMedia(id), getProductCategoryIds(id), getProductTagIds(id), getProductCollectionIds(id),
    getManualRelatedProducts(id), getManualUpsellProducts(id), getAutoExcludedIds(id),
  ])
  const excludedProducts = (await Promise.all(excludedIds.map((eid) => getProductById(eid)))).filter((p): p is NonNullable<typeof p> => !!p)
  return NextResponse.json({
    product, media, categoryIds, tagIds, collectionIds,
    relatedProducts: relatedProducts.map((p) => ({ id: p.id, name: p.name })),
    upsellProducts: upsellProducts.map((p) => ({ id: p.id, name: p.name })),
    excludedProducts: excludedProducts.map((p) => ({ id: p.id, name: p.name })),
  })
}

const MediaItem = z.object({ type: z.enum(['IMAGE', 'VIDEO_FILE', 'VIDEO_URL']), url: z.string(), altText: z.string().nullable().optional(), isPrimary: z.boolean().optional() })

const Body = z.object({
  name: z.string().min(1).optional(),
  status: z.enum(['DRAFT', 'ACTIVE', 'ARCHIVED']).optional(),
  description: z.string().nullable().optional(),
  shortDescription: z.string().nullable().optional(),
  sku: z.string().nullable().optional(),
  barcode: z.string().nullable().optional(),
  supplier: z.string().nullable().optional(),
  price: z.number().nonnegative().optional(),
  salePrice: z.number().nonnegative().nullable().optional(),
  retailPrice: z.number().nonnegative().nullable().optional(),
  tradePrice: z.number().nonnegative().nullable().optional(),
  costPrice: z.number().nonnegative().nullable().optional(),
  taxClassId: z.string().nullable().optional(),
  trackInventory: z.boolean().optional(),
  stockCount: z.number().int().nullable().optional(),
  lowStockThreshold: z.number().int().nullable().optional(),
  outOfStockBehaviour: z.enum(['BLOCK', 'BACKORDER']).optional(),
  weight: z.number().nonnegative().nullable().optional(),
  weightUnit: z.enum(['kg', 'lb']).nullable().optional(),
  dimensionL: z.number().nonnegative().nullable().optional(),
  dimensionW: z.number().nonnegative().nullable().optional(),
  dimensionH: z.number().nonnegative().nullable().optional(),
  dimensionUnit: z.enum(['cm', 'in']).nullable().optional(),
  digitalFileId: z.string().nullable().optional(),
  downloadLimit: z.number().int().nullable().optional(),
  downloadExpiry: z.number().int().nullable().optional(),
  metaTitle: z.string().nullable().optional(),
  metaDescription: z.string().nullable().optional(),
  ogImageId: z.string().nullable().optional(),
  isPreOrder: z.boolean().optional(),
  preOrderDispatchDate: z.coerce.date().nullable().optional(),
  preOrderNote: z.string().nullable().optional(),
  preOrderMaxQuantity: z.number().int().nullable().optional(),
  regenerateSlug: z.boolean().optional(),
  media: z.array(MediaItem).optional(),
  categoryIds: z.array(z.string()).optional(),
  masterCategoryId: z.string().nullable().optional(),
  tagIds: z.array(z.string()).optional(),
  collectionIds: z.array(z.string()).optional(),
})

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireShopUser('shop.products')
  if (gate.error) return gate.error

  const { id } = await params
  const before = await getProductById(id)
  if (!before) return NextResponse.json({ error: 'Product not found' }, { status: 404 })

  const parsed = Body.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid product' }, { status: 400 })
  const { media, categoryIds, tagIds, collectionIds, regenerateSlug, masterCategoryId, ...fields } = parsed.data
  const masterProvided = 'masterCategoryId' in parsed.data

  // The master must be one of the product's categories - fold it in if the
  // editor sent a master that isn't in the category list.
  const finalCategoryIds = masterCategoryId && categoryIds && !categoryIds.includes(masterCategoryId)
    ? [...categoryIds, masterCategoryId]
    : categoryIds

  const slug = regenerateSlug && fields.name ? await ensureUniqueProductSlug(slugify(fields.name), id) : undefined
  try {
    await updateProduct(id, { ...fields, ...(slug ? { slug } : {}), ...(masterProvided ? { masterCategoryId: masterCategoryId ?? null } : {}) })
  } catch (err) {
    const isUniqueViolation = err instanceof Prisma.PrismaClientKnownRequestError
      && (err.code === 'P2002' || (err.code === 'P2010' && String(err.meta?.message ?? '').includes('unique constraint')))
    if (isUniqueViolation) {
      return NextResponse.json({ error: 'That SKU is already used by another product.' }, { status: 409 })
    }
    throw err
  }

  if (media) await setProductMedia(id, media)
  if (finalCategoryIds) await setProductCategories(id, finalCategoryIds)
  if (tagIds) await setProductTags(id, tagIds)
  if (collectionIds) await setProductCollections(id, collectionIds)

  // File the product's images into Shop / <master category> / <product> /
  // <slug><n>. Runs after the media and category writes so it sees the final
  // state; no-op when nothing moved.
  if (media || finalCategoryIds || masterProvided) await reorganiseProductMedia(id)

  const after = await getProductById(id)
  if (after) {
    await maybeTriggerBackInStock(after, { stockCount: before.stockCount, outOfStockBehaviour: before.outOfStockBehaviour })
  }

  return NextResponse.json({ product: after })
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireShopUser('shop.products')
  if (gate.error) return gate.error
  const { id } = await params
  try {
    await deleteProduct(id)
  } catch (err) {
    // A product still tied to another module's data (e.g. it backs live product
    // options) can refuse to delete. Say so plainly rather than 500-ing.
    const isFkViolation = err instanceof Prisma.PrismaClientKnownRequestError
      && (err.code === 'P2003' || (err.code === 'P2010' && String(err.meta?.message ?? '').includes('foreign key')))
    if (isFkViolation) {
      return NextResponse.json({ error: 'This product is still linked to other data and could not be deleted.' }, { status: 409 })
    }
    throw err
  }
  return NextResponse.json({ success: true })
}
