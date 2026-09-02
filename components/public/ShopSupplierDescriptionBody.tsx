import { SUPPLIER_DESCRIPTION_LAYOUT_TYPE } from '@/modules/shop/lib/supplier-description'
import { ShopDesignedDescriptionBody } from '@/modules/shop/components/public/ShopDesignedDescriptionBody'
import type { PuckData } from '@/modules/shop/lib/types'

// A supplier's write-up, the twin of ShopCollectionDescriptionBody. Shared by the
// Supplier Description block and the fallback supplier page, so both make the
// same call about whether the designed version or the plain text wins.

export async function ShopSupplierDescriptionBody({ supplier, className, style }: {
  supplier: { description: string | null; descriptionPuck: PuckData | null }
  className?: string
  style?: React.CSSProperties
}) {
  return (
    <ShopDesignedDescriptionBody
      subject={supplier}
      layoutType={SUPPLIER_DESCRIPTION_LAYOUT_TYPE}
      className={className}
      style={style}
    />
  )
}
