import { NextRequest, NextResponse } from 'next/server'
import { requireShopUser } from '@/modules/shop/lib/access'
import { findProductMediaFolderId, getProductMediaFolderId } from '@/modules/shop/lib/media/product-media'

/**
 * The library folder this product's images belong in: Shop / <master category> /
 * <product>. The editor asks for it immediately before uploading, so the image
 * is written straight there rather than landing in the library root and waiting
 * for the save to re-file it.
 *
 * POST rather than GET because it creates the folder if it is missing, and it is
 * called at the moment of upload rather than on page load - asking on every
 * visit to the Images tab would leave an empty folder behind for every product
 * anyone merely looked at.
 *
 * `masterCategoryId` carries the category currently picked in the editor, which
 * may not be the saved one yet - passing it keeps a first upload out of
 * "Uncategorised". Omit it to use the product's saved master.
 */
/**
 * The looking-only counterpart: where the picker should OPEN. Walks the same
 * path but creates nothing, returning the deepest folder that already exists
 * (product folder, else its category, else Shop, else null for the root) - so
 * browsing a product with no uploads yet leaves no empty folder behind, which
 * is the very litter the POST-per-upload design above exists to avoid.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireShopUser('shop.products')
  if (gate.error) return gate.error

  const { id } = await params
  const raw = request.nextUrl.searchParams.get('masterCategoryId')
  const masterCategoryId = raw === null ? undefined : (raw || null)

  const folderId = await findProductMediaFolderId(id, { masterCategoryId })
  return NextResponse.json({ folderId })
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireShopUser('shop.products')
  if (gate.error) return gate.error

  const { id } = await params
  const raw = request.nextUrl.searchParams.get('masterCategoryId')
  const masterCategoryId = raw === null ? undefined : (raw || null)

  const folderId = await getProductMediaFolderId(id, { masterCategoryId })
  if (folderId === null) return NextResponse.json({ error: 'Product not found' }, { status: 404 })

  return NextResponse.json({ folderId })
}
