import { NextResponse } from 'next/server'
import { requireShopUser } from '@/modules/shop/lib/access'
import { buildImportTemplateCsv } from '@/modules/shop/lib/csv'

export async function GET() {
  const gate = await requireShopUser('shop.products')
  if (gate.error) return gate.error
  const csv = buildImportTemplateCsv()
  return new NextResponse(csv, { headers: { 'Content-Type': 'text/csv', 'Content-Disposition': 'attachment; filename="product-import-template.csv"' } })
}
