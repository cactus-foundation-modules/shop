import { NextRequest, NextResponse } from 'next/server'
import { requireShopUser } from '@/modules/shop/lib/access'
import { buildImportTemplateCsv, pickCsvColumns } from '@/modules/shop/lib/csv'

// `?columns=sku,sale_price,sale_sku` builds a partial template for an
// update-only import - the shop's own screens use it for the sale-price sheet.
// Unknown names are dropped rather than refused, and an empty result falls back
// to the full template, so a stale link never hands the owner a blank file.
export async function GET(request: NextRequest) {
  const gate = await requireShopUser('shop.products')
  if (gate.error) return gate.error
  const requested = request.nextUrl.searchParams.get('columns')
  const columns = requested ? pickCsvColumns(requested.split(',')) : []
  const partial = columns.length > 0
  const csv = partial ? buildImportTemplateCsv(columns) : buildImportTemplateCsv()
  const filename = partial ? 'product-update-template.csv' : 'product-import-template.csv'
  return new NextResponse(csv, { headers: { 'Content-Type': 'text/csv', 'Content-Disposition': `attachment; filename="${filename}"` } })
}
