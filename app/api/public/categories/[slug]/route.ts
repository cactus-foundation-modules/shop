import { NextResponse } from 'next/server'
import { errorResponse } from '@/lib/utils'
import { getCategoryBySlug, listProducts } from '@/modules/shop/lib/db'

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const category = await getCategoryBySlug(slug)
  if (!category) return errorResponse('Category not found', 404)
  const { products } = await listProducts({ status: 'ACTIVE', categorySlug: slug, perPage: 100, excludeHidden: true })
  return NextResponse.json({ category, products })
}
