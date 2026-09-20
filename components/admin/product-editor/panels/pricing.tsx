'use client'

import { Control, Field, Grid, Section, Select } from '@/modules/shop/components/admin/product-editor/fields'
import { useProductEditorPriceManaged } from '@/modules/shop/components/admin/product-editor/context'
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

export function PricingPanel({ state, setField, errors, currency, enabledPriceTypes, taxClasses, orderSizeDeductionEnabled }: PanelProps & { taxClasses: Term[] }) {
  const f = state.form
  const on = (type: ShpPriceType) => enabledPriceTypes.includes(type)
  // A product with variations is priced per variation on the Variations tab, so
  // the shop shows its price as a "From £…" range built from the cheapest one.
  // Its own Price boxes would set a figure no shopper ever sees, so they stand
  // down. The stored price is left untouched, which keeps it valid.
  const priceManaged = useProductEditorPriceManaged()

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

  // Order-size deduction. On the Pricing tab because it IS part of the price -
  // money already inside the shelf figure that stops being charged once the
  // basket is big enough. It is not delivery, and must never be worded as
  // carriage: delivery is a service this shop sells, priced wherever the site's
  // shipping is set up. The threshold and the wording shoppers see live on the
  // supplier (Shop > Suppliers), because they are the supplier's rule rather
  // than this product's.
  //
  // Built once and rendered by BOTH branches below, including the variation-
  // priced one. The early return under it stands the Price boxes down because a
  // variation-priced listing's own price is never charged - but its own amount
  // IS used, for the "some options drop to" line the product page shows before
  // a shopper has picked anything. Leaving it inside the branch that renders the
  // Price boxes hid the field on every listing with variations, which on a shop
  // built around them is every listing there is.
  const deductionSection = !orderSizeDeductionEnabled ? null : (
    <Section
      title="Order-size deduction"
      blurb={
        priceManaged
          ? "An amount already inside this price that comes back off once a basket holds enough of this supplier's goods. This one is the listing's own, used for the line shoppers see before they pick anything - each variation carries its own, over on the Variations tab."
          : "An amount already inside this price that comes back off once a basket holds enough of this supplier's goods."
      }
    >
      <Grid cols={2}>
        <Field
          label="Amount inside the price"
          optional
          error={errors.orderSizeDeduction}
          hint="Per item, not per order. Leave blank if this one carries nothing. It comes off whatever this item is charged at, sale price or not, so it wants checking whenever you reprice."
        >
          {(p) => (
            <Control
              {...p}
              inputMode="decimal"
              value={f.orderSizeDeduction}
              onChange={(e) => setField('orderSizeDeduction', e.target.value)}
              prefix={currency}
              placeholder="0.00"
            />
          )}
        </Field>
      </Grid>

      {f.orderSizeDeduction.trim() !== '' && !errors.orderSizeDeduction && Number.isFinite(charged) && (
        <p className="spe-hint" style={{ marginTop: '0.75rem' }}>
          Once the basket qualifies, shoppers pay {currency}{Math.max(0, charged - Number(f.orderSizeDeduction)).toFixed(2)} for each of these instead of {currency}{charged.toFixed(2)}.
          {f.supplier.trim() === ''
            ? ' Nothing will come off until this product names a supplier, and that supplier has a threshold set.'
            : ` Set the threshold on ${f.supplier.trim()} under Shop, then Suppliers.`}
        </p>
      )}
    </Section>
  )

  if (priceManaged) {
    return (
      <div className="spe-panel">
        <Section title="Price" blurb="This product is priced by its variations.">
          <p className="spe-hint">
            Each variation carries its own price, set over on the Variations tab. The shop shows this product as a &ldquo;From&rdquo; price built from the cheapest one, so there is nothing to set here.
          </p>
        </Section>

        {deductionSection}

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

        {/* Some suppliers issue a second code for discounted stock: order under
            that one, get the lower price. Their stock lists still speak the
            original, so it sits here beside the sale price rather than
            replacing the SKU over on Details. */}
        {on('sale') && (
          <Grid cols={2}>
            <Field
              label="Sale SKU"
              optional
              hint="The code to order this under while it is on offer, if your supplier issues one. Your own SKU stays exactly as it is."
            >
              {(p) => (
                <Control
                  {...p}
                  value={f.saleSku}
                  onChange={(e) => setField('saleSku', e.target.value)}
                  placeholder="e.g. PR1291"
                />
              )}
            </Field>
          </Grid>
        )}
      </Section>


      {deductionSection}

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
