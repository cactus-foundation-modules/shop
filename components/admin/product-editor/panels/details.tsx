'use client'

import { Control, Field, Grid, Section, Switch, TextArea } from '@/modules/shop/components/admin/product-editor/fields'
import type { PanelProps } from '@/modules/shop/components/admin/product-editor/model'

export function DetailsPanel({ state, setField, errors, supplierField }: PanelProps) {
  const f = state.form

  return (
    <div className="spe-panel">
      <Section title="Basics" blurb="The name is what shoppers see, and what the web address is built from.">
        <Grid>
          <Field label="Product name" error={errors.name}>
            {(p) => <Control {...p} value={f.name} onChange={(e) => setField('name', e.target.value)} placeholder="e.g. Hand-thrown stoneware mug" />}
          </Field>

          <Field
            label="Web address"
            hint={
              f.regenerateSlug
                ? 'The address will be rebuilt from the name when you save. Any existing links to the old address will stop working.'
                : 'Set when the product was created. Leave it alone unless the name has changed a lot, since changing it breaks existing links.'
            }
          >
            {(p) => (
              <Control
                {...p}
                readOnly
                value={f.slug ? `/shop/products/${f.slug}` : 'Saved when you first save the product'}
                prefix="🔗"
              />
            )}
          </Field>

          <Switch
            checked={f.regenerateSlug}
            onChange={(v) => setField('regenerateSlug', v)}
            label="Rebuild the web address from the name on save"
            hint="Only worth doing if the name has changed and nobody has linked to it yet."
          />
        </Grid>
      </Section>

      <Section title="Description" blurb="The short version shows on listing cards. The long version shows on the product page itself.">
        <Grid>
          <Field label="Short description" optional hint="One or two lines. Keep it punchy.">
            {(p) => <TextArea {...p} rows={2} value={f.shortDescription} onChange={(e) => setField('shortDescription', e.target.value)} />}
          </Field>
          <Field label="Full description" optional>
            {(p) => <TextArea {...p} rows={8} value={f.description} onChange={(e) => setField('description', e.target.value)} />}
          </Field>
        </Grid>
      </Section>

      <Section title="Product codes" blurb="Your own references. Neither is shown to shoppers unless your product page is set up to show the SKU.">
        <Grid cols={2}>
          <Field label="SKU" optional hint="Your stock code. Must be unique across the shop.">
            {(p) => <Control {...p} value={f.sku} onChange={(e) => setField('sku', e.target.value)} placeholder="e.g. MUG-STONE-01" />}
          </Field>
          <Field label="Barcode" optional hint="EAN, UPC or ISBN, if you use them.">
            {(p) => <Control {...p} value={f.barcode} onChange={(e) => setField('barcode', e.target.value)} placeholder="e.g. 5012345678900" />}
          </Field>
        </Grid>
      </Section>

      {supplierField.enabled && (
        <Section title={supplierField.label} blurb="Where this one came from. Switched on in shop settings, and renamed there too.">
          <Grid>
            <Field label={`${supplierField.label} name`} optional hint="Whatever you would recognise them by on an invoice.">
              {(p) => <Control {...p} value={f.supplier} onChange={(e) => setField('supplier', e.target.value)} placeholder="e.g. Northern Clay Co." />}
            </Field>
          </Grid>
        </Section>
      )}
    </div>
  )
}
