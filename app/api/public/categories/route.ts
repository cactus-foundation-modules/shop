import { NextResponse } from 'next/server'
import { listCategories } from '@/modules/shop/lib/db'
import { shopClosedResponse } from '@/modules/shop/lib/access'

export async function GET() {
  const closed = await shopClosedResponse()
  if (closed) return closed

  const categories = await listCategories()
  return NextResponse.json({ categories })
}
