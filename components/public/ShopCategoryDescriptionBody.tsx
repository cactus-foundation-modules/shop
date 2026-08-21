import { CATEGORY_DESCRIPTION_LAYOUT_TYPE } from '@/modules/shop/lib/category-description'
import { ShopDesignedDescriptionBody } from '@/modules/shop/components/public/ShopDesignedDescriptionBody'
import type { PuckData } from '@/modules/shop/lib/types'

// A category's long description. The choice between designed document, plain
// text and nothing at all lives in ShopDesignedDescriptionBody, which
// collections share - this only says which builder config stamps the document.

export async function ShopCategoryDescriptionBody({ category, className, style }: {
  category: { description: string | null; descriptionPuck: PuckData | null }
  className?: string
  style?: React.CSSProperties
}) {
  return (
    <ShopDesignedDescriptionBody
      subject={category}
      layoutType={CATEGORY_DESCRIPTION_LAYOUT_TYPE}
      className={className}
      style={style}
    />
  )
}
