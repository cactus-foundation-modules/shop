import { NextResponse } from 'next/server'
import { listCollections } from '@/modules/shop/lib/db'

export async function GET() {
  const collections = await listCollections()
  return NextResponse.json({ collections })
}
