import { connection } from 'next/server'
import { getSupplierBySlug } from '@/modules/shop/lib/db/suppliers'
import { ShopSupplierDescriptionBody } from '@/modules/shop/components/public/ShopSupplierDescriptionBody'
import { shopSupplierDescriptionPuckComponent, type ShopSupplierDescriptionProps } from './ShopSupplierDescription'

// Server (RSC) half of Shop: Supplier Description. Kept out of the client editor
// bundle - see ShopSupplierDescription.tsx.
//
// Prints the write-up the owner designed for this supplier, or its plain-text
// description where there is no design. Nothing when there is neither, so a
// layout carrying this block does not leave a gap on the suppliers nobody has
// got round to writing up yet.

export async function ShopSupplierDescriptionRsc(props: ShopSupplierDescriptionProps) {
  await connection()
  if (!props.supplierSlug) return null
  const supplier = await getSupplierBySlug(props.supplierSlug)
  if (!supplier || !supplier.storefrontVisible) return null
  return <ShopSupplierDescriptionBody supplier={supplier} />
}

export const shopSupplierDescriptionPuckRscComponent = {
  ...shopSupplierDescriptionPuckComponent,
  render: ShopSupplierDescriptionRsc,
}
