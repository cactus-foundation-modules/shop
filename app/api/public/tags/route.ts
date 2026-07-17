import { NextResponse } from 'next/server'
import { listTags } from '@/modules/shop/lib/db'
import { shopClosedResponse } from '@/modules/shop/lib/access'

export async function GET() {
  const closed = await shopClosedResponse()
  if (closed) return closed

  const tags = await listTags()
  return NextResponse.json({ tags })
}
