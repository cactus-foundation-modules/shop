'use client'

import { ProductPicker } from '@/modules/shop/components/admin/ProductPicker'
import { Control, Field, Grid, Section, Select } from '@/modules/shop/components/admin/product-editor/fields'
import type { PanelProps, RecommendationMode } from '@/modules/shop/components/admin/product-editor/model'

const MODE_HINT: Record<RecommendationMode, string> = {
  MANUAL: 'Only the products you pick below are shown.',
  AUTOMATIC: 'The shop picks for you, from the same categories. Anything you pick below is shown first.',
}

export function RecommendationsPanel({ state, setField, patch, errors, productId }: PanelProps & { productId: string }) {
  const f = state.form
  const anyAutomatic = f.relatedMode === 'AUTOMATIC' || f.upsellMode === 'AUTOMATIC'

  return (
    <div className="spe-panel">
      <Section title="Related products" blurb="The “you might also like” row on this product's page.">
        <Grid cols={2}>
          <Field label="How they are chosen" hint={MODE_HINT[f.relatedMode]}>
            {(p) => (
              <Select {...p} value={f.relatedMode} onChange={(e) => setField('relatedMode', e.target.value as RecommendationMode)}>
                <option value="MANUAL">Only what I pick</option>
                <option value="AUTOMATIC">Let the shop choose</option>
              </Select>
            )}
          </Field>
          <Field label="How many to show" error={errors.relatedLimit}>
            {(p) => <Control {...p} inputMode="numeric" value={f.relatedLimit} onChange={(e) => setField('relatedLimit', e.target.value)} />}
          </Field>
        </Grid>
        <div style={{ marginTop: '1rem' }}>
          <ProductPicker
            excludeId={productId}
            value={state.related}
            onChange={(next) => patch((s) => ({ ...s, related: next }))}
            reorderable
            label="Your picks, in the order they appear"
          />
        </div>
      </Section>

      <Section title="Upsells" blurb="The pricier alternative, nudged at the cart and checkout.">
        <Grid cols={2}>
          <Field label="How they are chosen" hint={MODE_HINT[f.upsellMode]}>
            {(p) => (
              <Select {...p} value={f.upsellMode} onChange={(e) => setField('upsellMode', e.target.value as RecommendationMode)}>
                <option value="MANUAL">Only what I pick</option>
                <option value="AUTOMATIC">Let the shop choose</option>
              </Select>
            )}
          </Field>
          <Field label="How many to show" error={errors.upsellLimit}>
            {(p) => <Control {...p} inputMode="numeric" value={f.upsellLimit} onChange={(e) => setField('upsellLimit', e.target.value)} />}
          </Field>
        </Grid>
        <div style={{ marginTop: '1rem' }}>
          <ProductPicker
            excludeId={productId}
            value={state.upsells}
            onChange={(next) => patch((s) => ({ ...s, upsells: next }))}
            reorderable
            label="Your picks, in the order they appear"
          />
        </div>
      </Section>

      {anyAutomatic && (
        <Section title="Never suggest these" blurb="Products the shop should keep out of its automatic picks. The discontinued, the embarrassing, the wildly unrelated.">
          <ProductPicker
            excludeId={productId}
            value={state.excluded}
            onChange={(next) => patch((s) => ({ ...s, excluded: next }))}
            label="Kept out of automatic suggestions"
          />
        </Section>
      )}
    </div>
  )
}
