import { NextResponse } from 'next/server'
import { listCategories } from '@/modules/shop/lib/db'

export async function GET() {
  const categories = await listCategories()
  return NextResponse.json({ categories })
}
