'use client'

import { Control, Field, Grid, Section, TextArea } from '@/modules/shop/components/admin/product-editor/fields'
import type { PanelProps } from '@/modules/shop/components/admin/product-editor/model'

const TITLE_MAX = 60
const DESC_MAX = 160

/** Search engines fall back to the product's own name and short description
 * when these are empty, so the preview shows what would actually appear. */
export function SeoPanel({ state, setField, siteUrl }: PanelProps & { siteUrl: string }) {
  const f = state.form
  const title = f.metaTitle.trim() || f.name.trim() || 'Untitled product'
  const description = f.metaDescription.trim() || f.shortDescription.trim() || 'No description yet, so search engines will make one up from the page.'
  const url = `${siteUrl.replace(/\/$/, '')}/shop/products/${f.slug || '…'}`

  return (
    <div className="spe-panel">
      <Section title="How it looks in search" blurb="Roughly what Google shows. Both boxes are optional: leave them empty and the product's own name and short description are used.">
        <div className="spe-serp">
          <p className="spe-serp-url">{url}</p>
          <p className="spe-serp-title">{title.length > TITLE_MAX ? `${title.slice(0, TITLE_MAX)}…` : title}</p>
          <p className="spe-serp-desc">{description.length > DESC_MAX ? `${description.slice(0, DESC_MAX)}…` : description}</p>
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
