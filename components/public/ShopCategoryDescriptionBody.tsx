import { Render } from '@puckeditor/core/rsc'
import type { Data } from '@puckeditor/core'
import { CATEGORY_DESCRIPTION_LAYOUT_TYPE } from '@/modules/shop/lib/category-description'
import type { PuckData } from '@/modules/shop/lib/types'

// A category's long description, in whichever form the owner has given it: the
// designed document when there is one, else the plain-text box, else nothing.
// Shared by the Category Description block and the fallback category page, so
// both make the same call about which version wins.

// A designed description that has been opened in the builder but never built in
// is an empty document, not a null one. Treating that as "designed" would blank
// out a perfectly good plain-text description the moment someone had a look at
// the builder, so an empty document counts as no design at all.
function hasContent(doc: PuckData | null): doc is PuckData {
  return !!doc && Array.isArray(doc.content) && doc.content.length > 0
}

export async function ShopCategoryDescriptionBody({ category, className, style }: {
  category: { description: string | null; descriptionPuck: PuckData | null }
  className?: string
  style?: React.CSSProperties
}) {
  if (hasContent(category.descriptionPuck)) {
    // config.rsc pulls in next/headers via other modules' RSC blocks, so it stays
    // a dynamic import here - same reason ShopProductDetail.rsc.tsx does it.
    const { getModuleLayoutPuckRscConfig } = await import('@/lib/puck/config.rsc')
    return (
      <div className={className} style={style}>
        {/* `as any`: Puck's RSC Render is typed against a concrete config, and the
            module config is assembled at runtime - same cast every other shop
            surface that stamps a document makes. */}
        <Render config={getModuleLayoutPuckRscConfig(CATEGORY_DESCRIPTION_LAYOUT_TYPE) as any} data={category.descriptionPuck as Data} />
      </div>
    )
  }

  if (!category.description) return null

  return (
    <div className={className} style={style}>
      <p style={{ margin: 0, maxWidth: '70ch', color: 'var(--color-text-muted)', lineHeight: 1.6, whiteSpace: 'pre-line' }}>
        {category.description}
      </p>
    </div>
  )
}
