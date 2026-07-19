import { NextRequest, NextResponse } from 'next/server'
import { requireShopUser } from '@/modules/shop/lib/access'
import { buildExportCsv } from '@/modules/shop/lib/csv'
import { buildProductCsvRows } from '@/modules/shop/lib/csv-rows'

export async function GET(request: NextRequest) {
  const gate = await requireShopUser('shop.products')
  if (gate.error) return gate.error

  const params = request.nextUrl.searchParams
  const status = (params.get('status') as never) ?? undefined
  const categorySlug = params.get('category') ?? undefined

  const rows = await buildProductCsvRows({ status, categorySlug })
  const csv = buildExportCsv(rows)
  return new NextResponse(csv, { headers: { 'Content-Type': 'text/csv', 'Content-Disposition': 'attachment; filename="products-export.csv"' } })
}
