import { NextRequest, NextResponse } from 'next/server'
import { requireShopUser } from '@/modules/shop/lib/access'
import { getSupplierById, getSupplierByName, updateSupplier, renameSupplier, deleteSupplier, replaceSupplierCatalogues } from '@/modules/shop/lib/db'
import { SupplierBody } from '@/modules/shop/lib/supplier-schema'

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireShopUser('shop.products')
  if (gate.error) return gate.error
  const { id } = await params

  const parsed = SupplierBody.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid supplier' }, { status: 400 })

  const existing = await getSupplierById(id)
  if (!existing) return NextResponse.json({ error: 'That supplier no longer exists.' }, { status: 404 })

  const { name, catalogues, ...fields } = parsed.data

  // A rename has to move the products filed under the old name too, so it goes
  // through its own transactional path rather than the generic field update.
  if (name.toLowerCase() !== existing.name.toLowerCase()) {
    const clash = await getSupplierByName(name)
    if (clash) return NextResponse.json({ error: `"${clash.name}" is already in your supplier list.` }, { status: 409 })
  }

  await updateSupplier(id, fields)
  if (name !== existing.name) await renameSupplier(id, existing.name, name)
  // Omitted entirely means the caller was not editing catalogues; an empty array
  // means the owner removed the last one.
  if (catalogues) await replaceSupplierCatalogues(id, catalogues)

  return NextResponse.json({ success: true })
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireShopUser('shop.products')
  if (gate.error) return gate.error
  const { id } = await params
  await deleteSupplier(id)
  return NextResponse.json({ success: true })
}
