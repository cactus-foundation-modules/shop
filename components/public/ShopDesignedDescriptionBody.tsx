import { Render } from '@puckeditor/core/rsc'
import type { Data } from '@puckeditor/core'
import { ShopCategoryDescriptionFold } from '@/modules/shop/components/public/ShopCategoryDescriptionFold'
import type { PuckData } from '@/modules/shop/lib/types'

// A category's or collection's long description, in whichever form the owner has
// given it: the designed document when there is one, else the plain-text box,
// else nothing. Shared by the Category Description and Collection Description
// blocks and by both fallback pages, so every one of them makes the same call
// about which version wins.
//
// The only thing that differs between the two is which builder config stamps the
// designed document, so that arrives as `layoutType` rather than in a second
// copy of this file.

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

export async function ShopDesignedDescriptionBody({ subject, layoutType, className, style }: {
  subject: { description: string | null; descriptionPuck: PuckData | null }
  /** The description builder's layout type - see lib/category-description.ts. */
  layoutType: string
  className?: string
  style?: React.CSSProperties
}) {
  // Only the plain-text description folds. A designed document is whatever the
  // owner built - pictures, grids, its own spacing - and hiding all of it behind
  // a "Read more" would fold away a layout that was placed deliberately. If a
  // designed description needs to be shorter it has the builder's own controls.
  if (hasContent(subject.descriptionPuck)) {
    // config.rsc pulls in next/headers via other modules' RSC blocks, so it stays
    // a dynamic import here - same reason ShopProductDetail.rsc.tsx does it.
    const { getModuleLayoutPuckRscConfig } = await import('@/lib/puck/config.rsc')
    return (
      <div className={className} style={style}>
        {/* `as any`: Puck's RSC Render is typed against a concrete config, and the
            module config is assembled at runtime - same cast every other shop
            surface that stamps a document makes. */}
        <Render config={getModuleLayoutPuckRscConfig(layoutType) as any} data={subject.descriptionPuck as Data} />
      </div>
    )
  }

  if (!subject.description) return null

  // A plain-text description is written as a couple of paragraphs, all of which
  // fold away behind the "Read more" the fold puts at the end of the heading's
  // blurb. Splitting on blank lines gives us the paragraphs; a single line break
  // inside one is left to `white-space: pre-line`, which is what the person
  // typing it into a plain text box would expect.
  //
  // The paragraphs flow into as many columns as the band will take, so an opened
  // description fills the width instead of leaving the right-hand half of the
  // page empty. `26rem` is the narrowest column worth having, so a phone gets
  // one column rather than a track wider than the screen, and the paragraph's
  // own 40rem cap holds the measure at the in-between widths where only one
  // column fits. Between them no media query is needed.
  //
  // Columns, not a grid. A grid gives every cell in a row the height of the
  // tallest one, so a short paragraph sitting beside a long one left a hole
  // under it the height of the difference, and the next paragraph began a fresh
  // row below the hole. Multi-column text has no rows to line up, so the
  // paragraphs simply carry on down one column and into the next, and the
  // browser balances the columns for us. `break-inside: avoid` keeps a paragraph
  // whole rather than tearing it across the gap mid-sentence.
  const paragraphs = subject.description.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean)

  return (
    <ShopCategoryDescriptionFold
      className={className}
      style={{ marginTop: '1.25rem', ...style }}
      foldStyle={{ columnWidth: '26rem', columnGap: '3rem' }}
      // The gap goes below each paragraph rather than above: a margin on the
      // paragraph that happens to land at the top of the second column would
      // push that column out of line with the first.
      paragraphStyle={{ ...PARAGRAPH, maxWidth: '40rem', marginBottom: '1.25rem', breakInside: 'avoid' }}
      paragraphs={paragraphs.length > 0 ? paragraphs : [subject.description]}
    />
  )
}
