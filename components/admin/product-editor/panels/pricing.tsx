'use client'

import { Control, Field, Grid, Section, Select } from '@/modules/shop/components/admin/product-editor/fields'
import type { PanelProps, ProductForm, Term } from '@/modules/shop/components/admin/product-editor/model'
import { PRICE_TYPE_META, type ShpPriceType } from '@/modules/shop/lib/pricing'

// Which form field backs each optional price type. Sale sits with the selling
// price (it is the only one a shopper ever sees); retail, trade and cost are
// reference figures and are grouped away from it.
const PRICE_FIELDS: Record<ShpPriceType, keyof ProductForm> = {
  sale: 'salePrice',
  retail: 'retailPrice',
  trade: 'tradePrice',
  cost: 'costPrice',
}

export function PricingPanel({ state, setField, errors, currency, enabledPriceTypes, taxClasses }: PanelProps & { taxClasses: Term[] }) {
  const f = state.form
  const on = (type: ShpPriceType) => enabledPriceTypes.includes(type)

  // Margin is worked out against what the shopper actually pays, so a product
  // on offer shows the margin of the offer rather than of a price nobody is
  // being charged. That is the figure that decides whether the sale is worth
  // running.
  const price = Number(f.price)
  const sale = Number(f.salePrice)
  const charged = on('sale') && f.salePrice.trim() !== '' && Number.isFinite(sale) && sale < price ? sale : price
  const cost = Number(f.costPrice)
  const hasMargin = on('cost') && f.costPrice.trim() !== '' && Number.isFinite(charged) && Number.isFinite(cost) && charged > 0
  const profit = hasMargin ? charged - cost : 0
  const margin = hasMargin ? (profit / charged) * 100 : 0
  const tone = !hasMargin ? undefined : profit < 0 ? 'bad' : margin >= 30 ? 'good' : undefined

  const priceField = (type: ShpPriceType) => {
    const key = PRICE_FIELDS[type]
    const meta = PRICE_TYPE_META[type]
    return (
      <Field key={type} label={meta.label} optional error={errors[key]} hint={meta.blurb}>
        {(p) => (
          <Control
            {...p}
            inputMode="decimal"
            value={f[key] as string}
            onChange={(e) => setField(key, e.target.value as ProductForm[typeof key])}
            prefix={currency}
            placeholder="0.00"
          />
        )}
      </Field>
    )
  }

  const internal = (['retail', 'trade', 'cost'] as const).filter(on)

  return (
    <div className="spe-panel">
      <Section title="Price" blurb="What you charge. Only the price itself is required; the rest are optional, and switched on under Shop settings.">
        <Grid cols={on('sale') ? 2 : 1}>
          <Field label="Price" error={errors.price}>
            {(p) => <Control {...p} inputMode="decimal" value={f.price} onChange={(e) => setField('price', e.target.value)} prefix={currency} placeholder="0.00" />}
          </Field>
          {on('sale') && priceField('sale')}
        </Grid>

        {on('sale') && f.salePrice.trim() !== '' && !errors.salePrice && Number.isFinite(price) && (
          <p className="spe-hint" style={{ marginTop: '0.75rem' }}>
            On offer: shoppers pay {currency}{charged.toFixed(2)}, with {currency}{price.toFixed(2)} shown struck through beside it.
          </p>
        )}
      </Section>

      {internal.length > 0 && (
        <Section title="Your own figures" blurb="Reference prices for you rather than for shoppers. None of these are ever charged.">
          <Grid cols={internal.length >= 3 ? 3 : 2}>
            {internal.map(priceField)}
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
      )}

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
