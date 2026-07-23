import { NextRequest, NextResponse } from 'next/server'
import { requireShopUser } from '@/modules/shop/lib/access'
import { listSuppliersWithCounts, listSupplierNames, createSupplier, getSupplierByName, replaceSupplierCatalogues } from '@/modules/shop/lib/db'
import { SupplierBody } from '@/modules/shop/lib/supplier-schema'

/**
 * `?for=picker` returns just the enabled suppliers' names - what the product and
 * variation dropdowns need. The full list runs a count aggregate over every
 * product row, which is the right cost for the Suppliers screen and the wrong
 * one for opening a product.
 */
export async function GET(request: NextRequest) {
  const gate = await requireShopUser('shop.products', { allowAccess: true })
  if (gate.error) return gate.error

  if (request.nextUrl.searchParams.get('for') === 'picker') {
    return NextResponse.json({ suppliers: await listSupplierNames() })
  }

  const suppliers = await listSuppliersWithCounts()
  return NextResponse.json({ suppliers })
}

export async function POST(request: NextRequest) {
  const gate = await requireShopUser('shop.products')
  if (gate.error) return gate.error

  const parsed = SupplierBody.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid supplier' }, { status: 400 })

  // Checked here as well as by the unique index, so a duplicate comes back as a
  // sentence the owner can act on instead of a 500 from Postgres.
  const clash = await getSupplierByName(parsed.data.name)
  if (clash) return NextResponse.json({ error: `"${clash.name}" is already in your supplier list.` }, { status: 409 })

  const { catalogues, ...supplier } = parsed.data
  const { id } = await createSupplier(supplier)
  if (catalogues) await replaceSupplierCatalogues(id, catalogues)
  return NextResponse.json({ id, name: parsed.data.name }, { status: 201 })
}
