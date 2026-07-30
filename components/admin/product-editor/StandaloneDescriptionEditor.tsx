'use client'

import { useCallback } from 'react'
import { StandaloneDescriptionBuilder } from '@/modules/shop/components/admin/description-builder/StandaloneDescriptionBuilder'
import {
  DESCRIPTION_LAYOUT_TYPE,
  broadcastDescriptionSaved,
} from '@/modules/shop/components/admin/product-editor/description-puck'
import type { PuckData } from '@/modules/shop/lib/types'

/**
 * The product description page builder, on its own full-screen page with none of
 * the admin chrome (the route strips it). The builder itself is shared with the
 * category description (description-builder/StandaloneDescriptionBuilder); this
 * wrapper only says which record is being edited, and tells any open product
 * editor when a save lands (broadcastDescriptionSaved) so the two never fight
 * over which copy wins.
 */
export function StandaloneDescriptionEditor({ productId, productName, backHref, initialData }: {
  productId: string
  productName: string
  backHref: string
  initialData: PuckData | null
}) {
  const onSaved = useCallback(
    (data: PuckData) => broadcastDescriptionSaved(productId, data),
    [productId],
  )

  return (
    <StandaloneDescriptionBuilder
      layoutType={DESCRIPTION_LAYOUT_TYPE}
      eyebrow="Editing description"
      title={productName}
      backHref={backHref}
      backLabel="Back to product"
      initialData={initialData}
      endpoint={`/api/m/shop/admin/products/${productId}`}
      field="descriptionPuck"
      onSaved={onSaved}
      unsavedMessage="You have unsaved changes to this description. Leave without saving?"
    />
  )
}
