import { NextRequest, NextResponse } from 'next/server'
import { requireShopUser } from '@/modules/shop/lib/access'
import { buildExportCsv, pickCsvColumns } from '@/modules/shop/lib/csv'
import { buildProductCsvRows } from '@/modules/shop/lib/csv-rows'

export async function GET(request: NextRequest) {
  const gate = await requireShopUser('shop.products')
  if (gate.error) return gate.error

  const params = request.nextUrl.searchParams
  const status = (params.get('status') as never) ?? undefined
  const categorySlug = params.get('category') ?? undefined

  // `?columns=sku,categories` narrows the export to the columns picked in the
  // Export CSV modal. Unknown names are dropped rather than refused, and an
  // empty result falls back to the whole format - the same lenient rule the
  // import-template route uses, so a stale bookmark never yields a blank file.
  const requested = params.get('columns')
  const columns = requested ? pickCsvColumns(requested.split(',')) : []

  const rows = await buildProductCsvRows({ status, categorySlug })
  const csv = buildExportCsv(rows, columns.length > 0 ? columns : undefined)
  return new NextResponse(csv, { headers: { 'Content-Type': 'text/csv', 'Content-Disposition': 'attachment; filename="products-export.csv"' } })
}
