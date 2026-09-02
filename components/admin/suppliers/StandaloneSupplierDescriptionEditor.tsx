'use client'

import { StandaloneDescriptionBuilder } from '@/modules/shop/components/admin/description-builder/StandaloneDescriptionBuilder'
import { SUPPLIER_DESCRIPTION_LAYOUT_TYPE } from '@/modules/shop/lib/supplier-description'
import type { PuckData } from '@/modules/shop/lib/types'

/**
 * The supplier write-up page builder, on its own full-screen page with none of
 * the admin chrome (the route strips it). The builder is the one products,
 * categories and collections use; this wrapper only points it at the supplier
 * record. There is no cross-tab broadcast to do - the suppliers screen refetches
 * the whole list whenever it changes, so it picks a new write-up up on its own.
 */
export function StandaloneSupplierDescriptionEditor({ supplierId, supplierName, backHref, initialData }: {
  supplierId: string
  supplierName: string
  backHref: string
  initialData: PuckData | null
}) {
  return (
    <StandaloneDescriptionBuilder
      layoutType={SUPPLIER_DESCRIPTION_LAYOUT_TYPE}
      eyebrow="Editing supplier write-up"
      title={supplierName}
      backHref={backHref}
      backLabel="Back to suppliers"
      initialData={initialData}
      endpoint={`/api/m/shop/admin/suppliers/${supplierId}`}
      field="descriptionPuck"
      unsavedMessage="You have unsaved changes to this write-up. Leave without saving?"
    />
  )
}
