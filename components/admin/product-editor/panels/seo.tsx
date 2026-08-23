'use client'

import { Control, Field, Grid, Section, TextArea } from '@/modules/shop/components/admin/product-editor/fields'
import type { PanelProps } from '@/modules/shop/components/admin/product-editor/model'
import { productHref, type ProductUrlStyle } from '@/modules/shop/lib/product-url'
import { generateSlug } from '@/lib/utils'

const TITLE_MAX = 60
const DESC_MAX = 160

/** Search engines fall back to the product's own name and short description
 * when these are empty, so the preview shows what would actually appear. */
export function SeoPanel({ state, setField, siteUrl, productUrlStyle }: PanelProps & { siteUrl: string; productUrlStyle: ProductUrlStyle }) {
  const f = state.form
  const title = f.metaTitle.trim() || f.name.trim() || 'Untitled product'
  const description = f.metaDescription.trim() || f.shortDescription.trim() || 'No description yet, so search engines will make one up from the page.'
  // The address the page actually answers on, so the preview matches reality on
  // a shop that has moved its products to the site root. The placeholder stands
  // in before a slug exists; encodeURIComponent would only mangle the ellipsis.
  // With a rebuild pending the preview shows where the page is about to move to,
  // not where it still is. The real answer can pick up a "-2" if another product
  // already holds that address, which only the save can know.
  const pendingSlug = f.regenerateSlug ? generateSlug(f.name.trim()) : ''
  const shownSlug = pendingSlug || f.slug
  const url = shownSlug
    ? `${siteUrl.replace(/\/$/, '')}${productHref(shownSlug, productUrlStyle)}`
    : `${siteUrl.replace(/\/$/, '')}${productUrlStyle === 'ROOT' ? '/…' : '/shop/products/…'}`

  return (
    <div className="spe-panel">
      <Section title="How it looks in search" blurb="Roughly what Google shows. Both boxes are optional: leave them empty and the product's own name and short description are used.">
        <div className="spe-serp">
          <p className="spe-serp-url">{url}</p>
          <p className="spe-serp-title">{title.length > TITLE_MAX ? `${title.slice(0, TITLE_MAX)}…` : title}</p>
          <p className="spe-serp-desc">{description.length > DESC_MAX ? `${description.slice(0, DESC_MAX)}…` : description}</p>
        </div>

        {/* The address is left alone by an ordinary save - it is a live link, and
            quietly moving it every time someone tidies a name would break every
            share of it. Rebuilding is therefore something you ask for, and when
            you do it carries the product's variations along too: each one is
            addressed from this one, and the basket links its lines there. */}
        <div className="spe-serp-address">
          {f.regenerateSlug ? (
            <>
              <p className="spe-save-note" style={{ margin: 0 }}>
                The address is rebuilt from the name when you save, and every variation of this product moves with it.
                The old address stops working.
              </p>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setField('regenerateSlug', false)}>
                Leave the address alone
              </button>
            </>
          ) : (
            <>
              <p className="spe-save-note" style={{ margin: 0 }}>
                Renaming a product leaves its address as it was. Rebuild it to match the name.
              </p>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={f.name.trim() === ''}
                onClick={() => setField('regenerateSlug', true)}
              >
                Rebuild web address
              </button>
            </>
          )}
        </div>

        <div style={{ marginTop: '1rem' }}>
          <Grid>
            <Field
              label="Search title"
              optional
              count={{ value: f.metaTitle.length, max: TITLE_MAX }}
              hint="Google cuts it off around sixty characters, so put the important words first."
            >
              {(p) => <Control {...p} value={f.metaTitle} onChange={(e) => setField('metaTitle', e.target.value)} placeholder={f.name || 'Product name'} />}
            </Field>
            <Field
              label="Search description"
              optional
              count={{ value: f.metaDescription.length, max: DESC_MAX }}
              hint="The grey blurb under the link. It does not change your ranking, but it does decide whether anyone clicks."
            >
              {(p) => <TextArea {...p} rows={3} value={f.metaDescription} onChange={(e) => setField('metaDescription', e.target.value)} placeholder={f.shortDescription || 'A short, tempting summary.'} />}
            </Field>
          </Grid>
        </div>
      </Section>
    </div>
  )
}
