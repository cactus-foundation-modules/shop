import { NextResponse } from 'next/server'
import { listVisibleTags } from '@/modules/shop/lib/db'
import { shopClosedResponse } from '@/modules/shop/lib/access'

export async function GET() {
  const closed = await shopClosedResponse()
  if (closed) return closed

  // Storefront-hidden tags are filing, not content: they never leave the admin.
  const tags = await listVisibleTags()
  return NextResponse.json({ tags })
}
