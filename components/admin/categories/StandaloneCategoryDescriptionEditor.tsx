'use client'

import { StandaloneDescriptionBuilder } from '@/modules/shop/components/admin/description-builder/StandaloneDescriptionBuilder'
import { CATEGORY_DESCRIPTION_LAYOUT_TYPE } from '@/modules/shop/lib/category-description'
import type { PuckData } from '@/modules/shop/lib/types'

/**
 * The category description page builder, on its own full-screen page with none of
 * the admin chrome (the route strips it). The builder is the one products use;
 * this wrapper only points it at the category record. There is no cross-tab
 * broadcast to do - the categories screen refetches the whole tree whenever it
 * changes, so it picks a new description up on its own.
 */
export function StandaloneCategoryDescriptionEditor({ categoryId, categoryName, backHref, initialData }: {
  categoryId: string
  categoryName: string
  backHref: string
  initialData: PuckData | null
}) {
  return (
    <StandaloneDescriptionBuilder
      layoutType={CATEGORY_DESCRIPTION_LAYOUT_TYPE}
      eyebrow="Editing category description"
      title={categoryName}
      backHref={backHref}
      backLabel="Back to categories"
      initialData={initialData}
      endpoint={`/api/m/shop/admin/categories/${categoryId}`}
      field="descriptionPuck"
      unsavedMessage="You have unsaved changes to this description. Leave without saving?"
    />
  )
}
