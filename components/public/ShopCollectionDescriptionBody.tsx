import { COLLECTION_DESCRIPTION_LAYOUT_TYPE } from '@/modules/shop/lib/collection-description'
import { ShopDesignedDescriptionBody } from '@/modules/shop/components/public/ShopDesignedDescriptionBody'
import type { PuckData } from '@/modules/shop/lib/types'

// A collection's long description, the twin of ShopCategoryDescriptionBody.
// Shared by the Collection Description block and the fallback collection page.

export async function ShopCollectionDescriptionBody({ collection, className, style }: {
  collection: { description: string | null; descriptionPuck: PuckData | null }
  className?: string
  style?: React.CSSProperties
}) {
  return (
    <ShopDesignedDescriptionBody
      subject={collection}
      layoutType={COLLECTION_DESCRIPTION_LAYOUT_TYPE}
      className={className}
      style={style}
    />
  )
}
