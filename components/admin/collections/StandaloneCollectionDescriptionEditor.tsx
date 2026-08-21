'use client'

import { StandaloneDescriptionBuilder } from '@/modules/shop/components/admin/description-builder/StandaloneDescriptionBuilder'
import { COLLECTION_DESCRIPTION_LAYOUT_TYPE } from '@/modules/shop/lib/collection-description'
import type { PuckData } from '@/modules/shop/lib/types'

/**
 * The collection description page builder, on its own full-screen page with none
 * of the admin chrome (the route strips it). The builder is the one products and
 * categories use; this wrapper only points it at the collection record. There is
 * no cross-tab broadcast to do - the collections screen refetches the whole list
 * whenever it changes, so it picks a new description up on its own.
 */
export function StandaloneCollectionDescriptionEditor({ collectionId, collectionName, backHref, initialData }: {
  collectionId: string
  collectionName: string
  backHref: string
  initialData: PuckData | null
}) {
  return (
    <StandaloneDescriptionBuilder
      layoutType={COLLECTION_DESCRIPTION_LAYOUT_TYPE}
      eyebrow="Editing collection description"
      title={collectionName}
      backHref={backHref}
      backLabel="Back to collections"
      initialData={initialData}
      endpoint={`/api/m/shop/admin/collections/${collectionId}`}
      field="descriptionPuck"
      unsavedMessage="You have unsaved changes to this description. Leave without saving?"
    />
  )
}
