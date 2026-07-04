import { NextResponse } from 'next/server'
import { listTags } from '@/modules/shop/lib/db'

export async function GET() {
  const tags = await listTags()
  return NextResponse.json({ tags })
}
