import { NextResponse } from 'next/server'
import { requireShopUser } from '@/modules/shop/lib/access'
import { getImportJobById } from '@/modules/shop/lib/db'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireShopUser('shop.products')
  if (gate.error) return gate.error

  const { id } = await params
  const job = await getImportJobById(id)
  if (!job) return NextResponse.json({ error: 'Import job not found' }, { status: 404 })
  return NextResponse.json({ job })
}
