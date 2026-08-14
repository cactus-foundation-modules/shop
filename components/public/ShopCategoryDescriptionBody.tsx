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

const PARAGRAPH: React.CSSProperties = {
  margin: 0,
  color: 'var(--color-text-muted)',
  lineHeight: 1.6,
  // Kept, so a single line break inside a paragraph is still honoured.
  whiteSpace: 'pre-line',
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

  // A plain-text description is written as a few paragraphs. The first is the
  // lead, so it stretches the full width of the band; the rest flow into as
  // many columns as the band will take, which fills the space without letting
  // a supporting paragraph run past a comfortable measure.
  // `min(26rem, 100%)` is what keeps a phone to one column instead of forcing a
  // track wider than the screen, and the paragraph's own 40rem cap holds the
  // measure at the in-between widths where only one column fits. Between them no
  // media query is needed. (The cap belongs on the paragraph, not the track: a
  // definite track maximum is what auto-fit counts columns with, so 40rem there
  // would buy one fat column where two slim ones fit.)
  const paragraphs = category.description.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean)

  return (
    <div
      className={className}
      style={{
        marginTop: '1.25rem',
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(min(26rem, 100%), 1fr))',
        columnGap: '3rem',
        rowGap: '1.25rem',
        ...style,
      }}
    >
      {paragraphs.map((p, i) => (
        <p key={i} style={i === 0 ? { ...PARAGRAPH, gridColumn: '1 / -1' } : { ...PARAGRAPH, maxWidth: '40rem' }}>{p}</p>
      ))}
    </div>
  )
}
