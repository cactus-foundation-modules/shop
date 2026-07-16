'use client'

import { Control, Field, Grid, Reveal, Section, Select, Switch } from '@/modules/shop/components/admin/product-editor/fields'
import type { PanelProps } from '@/modules/shop/components/admin/product-editor/model'

export function StockPanel({ state, setField, errors }: PanelProps) {
  const f = state.form

  return (
    <div className="spe-panel">
      <Section title="Stock" blurb="Leave stock tracking off for anything you will never run out of, like a made-to-order item.">
        <Switch
          checked={f.trackInventory}
          onChange={(v) => setField('trackInventory', v)}
          label="Keep count of stock"
          hint="Counts down as orders come in, and can stop sales when you hit zero."
        />
        {f.trackInventory && (
          <Reveal>
            <Grid cols={3}>
              <Field label="Units in stock" error={errors.stockCount}>
                {(p) => <Control {...p} inputMode="numeric" value={f.stockCount} onChange={(e) => setField('stockCount', e.target.value)} placeholder="0" />}
              </Field>
              <Field label="Warn me at" optional error={errors.lowStockThreshold} hint="You get an email when stock drops to this. Leave empty for no warning.">
                {(p) => <Control {...p} inputMode="numeric" value={f.lowStockThreshold} onChange={(e) => setField('lowStockThreshold', e.target.value)} placeholder="e.g. 5" />}
              </Field>
              <Field label="When it runs out" hint={f.outOfStockBehaviour === 'BACKORDER' ? 'Shoppers can still buy, and you owe them the item.' : 'The buy button is disabled until you restock.'}>
                {(p) => (
                  <Select {...p} value={f.outOfStockBehaviour} onChange={(e) => setField('outOfStockBehaviour', e.target.value as typeof f.outOfStockBehaviour)}>
                    <option value="BLOCK">Stop selling it</option>
                    <option value="BACKORDER">Keep selling on backorder</option>
                  </Select>
                )}
              </Field>
            </Grid>
          </Reveal>
        )}
      </Section>

      <Section title="Pre-order" blurb="For something you are taking money for now and posting later.">
        <Switch
          checked={f.isPreOrder}
          onChange={(v) => setField('isPreOrder', v)}
          label="Sell this as a pre-order"
          hint="The product page says so, rather than pretending it is on the shelf."
        />
        {f.isPreOrder && (
          <Reveal>
            <Grid cols={3}>
              <Field label="Expected dispatch" optional hint="Shown on the product page, so be realistic.">
                {(p) => <Control {...p} type="date" value={f.preOrderDispatchDate} onChange={(e) => setField('preOrderDispatchDate', e.target.value)} />}
              </Field>
              <Field label="Max per order" optional error={errors.preOrderMaxQuantity} hint="Stops one person taking the lot.">
                {(p) => <Control {...p} inputMode="numeric" value={f.preOrderMaxQuantity} onChange={(e) => setField('preOrderMaxQuantity', e.target.value)} placeholder="No limit" />}
              </Field>
              <Field label="Taken so far">
                {(p) => <Control {...p} readOnly value={`${f.preOrderCount} ${f.preOrderCount === 1 ? 'unit' : 'units'}`} />}
              </Field>
            </Grid>
            <div style={{ marginTop: '1rem' }}>
              <Field label="Note for shoppers" optional hint="A line of reassurance on the product page.">
                {(p) => <Control {...p} value={f.preOrderNote} onChange={(e) => setField('preOrderNote', e.target.value)} placeholder="e.g. Ships the week of the 12th, straight from the kiln." />}
              </Field>
            </div>
          </Reveal>
        )}
      </Section>

      <Section
        title="Weight & size"
        blurb="Used to work out postage when your shipping rates are priced by weight. Skip it if you charge a flat rate."
      >
        <Grid cols={2}>
          <Field label="Weight" optional error={errors.weight}>
            {(p) => (
              <span className="spe-prefixed">
                <Control {...p} inputMode="decimal" value={f.weight} onChange={(e) => setField('weight', e.target.value)} placeholder="0.000" />
                <span className="spe-suffix">
                  <select
                    aria-label="Weight unit"
                    value={f.weightUnit}
                    onChange={(e) => setField('weightUnit', e.target.value as typeof f.weightUnit)}
                    style={{ border: 'none', background: 'none', font: 'inherit', color: 'inherit', cursor: 'pointer' }}
                  >
                    <option value="kg">kg</option>
                    <option value="lb">lb</option>
                  </select>
                </span>
              </span>
            )}
          </Field>
          <Field label="Measured in">
            {(p) => (
              <Select {...p} value={f.dimensionUnit} onChange={(e) => setField('dimensionUnit', e.target.value as typeof f.dimensionUnit)}>
                <option value="cm">Centimetres</option>
                <option value="in">Inches</option>
              </Select>
            )}
          </Field>
        </Grid>
        <div style={{ marginTop: '1rem' }}>
          <Grid cols={3}>
            <Field label="Length" optional error={errors.dimensionL}>
              {(p) => <Control {...p} inputMode="decimal" value={f.dimensionL} onChange={(e) => setField('dimensionL', e.target.value)} suffix={f.dimensionUnit} placeholder="0.00" />}
            </Field>
            <Field label="Width" optional error={errors.dimensionW}>
              {(p) => <Control {...p} inputMode="decimal" value={f.dimensionW} onChange={(e) => setField('dimensionW', e.target.value)} suffix={f.dimensionUnit} placeholder="0.00" />}
            </Field>
            <Field label="Height" optional error={errors.dimensionH}>
              {(p) => <Control {...p} inputMode="decimal" value={f.dimensionH} onChange={(e) => setField('dimensionH', e.target.value)} suffix={f.dimensionUnit} placeholder="0.00" />}
            </Field>
          </Grid>
        </div>
      </Section>
    </div>
  )
}
