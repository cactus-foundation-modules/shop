'use client'

import { Control, Field, Grid, Section, Select } from '@/modules/shop/components/admin/product-editor/fields'
import type { PanelProps, Term } from '@/modules/shop/components/admin/product-editor/model'

export function PricingPanel({ state, setField, errors, currency, taxClasses }: PanelProps & { taxClasses: Term[] }) {
  const f = state.form
  const price = Number(f.price)
  const cost = Number(f.costPrice)
  const hasMargin = f.costPrice.trim() !== '' && Number.isFinite(price) && Number.isFinite(cost) && price > 0
  const profit = hasMargin ? price - cost : 0
  const margin = hasMargin ? (profit / price) * 100 : 0
  const tone = !hasMargin ? undefined : profit < 0 ? 'bad' : margin >= 30 ? 'good' : undefined

  return (
    <div className="spe-panel">
      <Section title="Price" blurb="What you charge, what it used to cost, and what it costs you.">
        <Grid cols={3}>
          <Field label="Price" error={errors.price}>
            {(p) => <Control {...p} inputMode="decimal" value={f.price} onChange={(e) => setField('price', e.target.value)} prefix={currency} placeholder="0.00" />}
          </Field>
          <Field
            label="Compare-at price"
            optional
            error={errors.compareAtPrice}
            hint="The old price, shown struck through next to the new one. Leave empty if it is not on offer."
          >
            {(p) => <Control {...p} inputMode="decimal" value={f.compareAtPrice} onChange={(e) => setField('compareAtPrice', e.target.value)} prefix={currency} placeholder="0.00" />}
          </Field>
          <Field
            label="Cost price"
            optional
            error={errors.costPrice}
            hint="What the item costs you. Never shown to shoppers, only used for the margin below."
          >
            {(p) => <Control {...p} inputMode="decimal" value={f.costPrice} onChange={(e) => setField('costPrice', e.target.value)} prefix={currency} placeholder="0.00" />}
          </Field>
        </Grid>

        {hasMargin && (
          <div className="spe-margin" style={{ marginTop: '1rem' }}>
            <div className="spe-margin-item">
              <span className="spe-margin-label">Profit per sale</span>
              <span className="spe-margin-value" data-tone={tone}>{currency}{profit.toFixed(2)}</span>
            </div>
            <div className="spe-margin-item">
              <span className="spe-margin-label">Margin</span>
              <span className="spe-margin-value" data-tone={tone}>{margin.toFixed(1)}%</span>
            </div>
            {profit < 0 && (
              <div className="spe-margin-item">
                <span className="spe-margin-label">Heads up</span>
                <span className="spe-margin-value" data-tone="bad">You are selling at a loss</span>
              </div>
            )}
          </div>
        )}
      </Section>

      <Section title="Tax" blurb="Which tax class this product falls under. The rate itself is set per zone under Tax & shipping.">
        <Grid cols={2}>
          <Field label="Tax class" hint={taxClasses.length === 0 ? 'No tax classes set up yet. Add them under Shop, then Tax & shipping.' : undefined}>
            {(p) => (
              <Select {...p} value={f.taxClassId} onChange={(e) => setField('taxClassId', e.target.value)}>
                <option value="">No tax class</option>
                {taxClasses.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </Select>
            )}
          </Field>
        </Grid>
      </Section>
    </div>
  )
}
