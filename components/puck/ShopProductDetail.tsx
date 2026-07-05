import type { LayoutRef } from '@/lib/puck/LayoutPickerField'
import { ShopLayoutPicker } from '@/modules/shop/components/public/ShopLayoutPicker'

// [ANCHOR] on the shopProduct page. The product detail now renders from a
// designable Product Detail layout (admin > Layouts > Shop > Product Detail),
// built from the part-blocks in components/puck/parts/detail-parts.tsx - not
// hardcoded JSX. This block resolves that layout (a per-block override if set,
// else the published `shopProductDetail` default), injects the current product
// into its parts, and renders it. productSlug is injected by the product page
// (lib/inject-product-context.ts).
//
// This file is the EDITOR half only: a client-safe placeholder plus the Puck
// field config. The server render (prisma, next/server, and the RSC Puck config
// via lib/puck/config.rsc) lives in ShopProductDetail.rsc.tsx so it is never
// pulled into the client Puck editor bundle. The manifest wires the two halves
// with `rscImport` - see scripts/generate-module-puck.mjs.
export type ShopProductDetailProps = {
  productSlug?: string
  layoutRef?: LayoutRef | null
}

// Editor canvas: a light two-column placeholder so the shopProduct page editor
// isn't misleading - the real layout is the resolved Product Detail template.
export function ShopProductDetail(_props: ShopProductDetailProps) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32, opacity: 0.6, padding: '8px 0' }}>
      <div style={{ border: '1px solid var(--color-border)', borderRadius: 16, background: 'var(--color-bg-subtle)', aspectRatio: '1/1' }} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ height: 24, width: '40%', background: 'var(--color-border)', borderRadius: 6 }} />
        <div style={{ height: 30, width: '70%', background: 'var(--color-border)', borderRadius: 6 }} />
        <div style={{ height: 24, width: 110, background: 'var(--color-border)', borderRadius: 6 }} />
        <div style={{ height: 52, width: '80%', background: 'var(--color-border)', borderRadius: 9999, marginTop: 12 }} />
      </div>
    </div>
  )
}

const layoutField = {
  type: 'custom' as const,
  label: 'Layout',
  render: ({ value, onChange }: any) => <ShopLayoutPicker type="shopProductDetail" value={value} onChange={onChange} />,
}

export const shopProductDetailPuckComponent = {
  label: 'Shop: Product Detail [Anchor]',
  fields: {
    layoutRef: layoutField,
  },
  defaultProps: { layoutRef: null },
  permissions: { delete: false, duplicate: false },
  render: ShopProductDetail,
}
