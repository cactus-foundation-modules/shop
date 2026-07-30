import { NextRequest, NextResponse } from 'next/server'
import { requireShopUser } from '@/modules/shop/lib/access'
import { findCategoryMediaFolderId, getCategoryMediaFolderId } from '@/modules/shop/lib/media/category-media'

// Where a category's picture belongs: Shop / <the category's ancestor trail>,
// the folder its products are filed under. The same two-verb split as shop's
// products/[id]/media-folder, for the same reasons.
//
// `name` and `parentId` carry the name and parent currently typed into the row's
// edit panel, which may not be the saved ones yet - passing them keeps a picture
// picked after a rename or a move out of the old folder. Omit them to use what is
// saved; an empty `parentId` means the top level.
function overrides(request: NextRequest): { name?: string; parentId?: string | null } {
  const rawName = request.nextUrl.searchParams.get('name')
  const rawParent = request.nextUrl.searchParams.get('parentId')
  return {
    ...(rawName ? { name: rawName } : {}),
    ...(rawParent === null ? {} : { parentId: rawParent || null }),
  }
}

/**
 * Looking only: where the picker should OPEN. Walks the path but creates
 * nothing, returning the deepest folder that already exists (the category's own,
 * else an ancestor's, else Shop, else null for the root) - so merely browsing a
 * category leaves no empty folder behind.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireShopUser('shop.products')
  if (gate.error) return gate.error

  const { id } = await params
  const folderId = await findCategoryMediaFolderId(id, overrides(request))
  return NextResponse.json({ folderId })
}

/**
 * Creating: where an upload should be filed. POST rather than GET because it
 * creates the folder, and it is asked at the moment of upload rather than on page
 * load - resolving it for every category anyone merely looked at would litter the
 * library with empty folders.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireShopUser('shop.products')
  if (gate.error) return gate.error

  const { id } = await params
  const folderId = await getCategoryMediaFolderId(id, overrides(request))
  if (folderId === null) return NextResponse.json({ error: 'Category not found' }, { status: 404 })

  return NextResponse.json({ folderId })
}
