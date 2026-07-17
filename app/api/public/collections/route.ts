import { NextResponse } from 'next/server'
import { listCollections } from '@/modules/shop/lib/db'
import { shopClosedResponse } from '@/modules/shop/lib/access'

export async function GET() {
  const closed = await shopClosedResponse()
  if (closed) return closed

  const collections = await listCollections()
  return NextResponse.json({ collections })
}
