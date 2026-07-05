import type { LayoutRef } from '@/lib/puck/LayoutPickerField'
import { ShopLayoutPicker } from '@/modules/shop/components/public/ShopLayoutPicker'

// EDITOR half only: placeholder + Puck field config. The server render lives in
// ShopProductCard.rsc.tsx (wired by `rscImport` in the manifest) so its
// lib/card-template dependency - which dynamically pulls the next/headers-tainted
// RSC Puck config - never lands in the client editor bundle.
export type ShopProductCardProps = { productSlug?: string; layoutRef?: LayoutRef | null }

export function ShopProductCard(_props: ShopProductCardProps) {
  return (
    <div style={{ border: '1px solid var(--color-border)', borderRadius: 12, overflow: 'hidden', opacity: 0.6, maxWidth: 280 }}>
      <div style={{ aspectRatio: '4/3', background: 'var(--color-bg-subtle)' }} />
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ height: 14, width: '70%', background: 'var(--color-border)', borderRadius: 4 }} />
        <div style={{ height: 14, width: '35%', background: 'var(--color-border)', borderRadius: 4 }} />
      </div>
    </div>
  )
}

const layoutField = {
  type: 'custom' as const,
  label: 'Card layout',
  render: ({ value, onChange }: any) => <ShopLayoutPicker type="shopProductCard" value={value} onChange={onChange} />,
}

export const shopProductCardPuckComponent = {
  label: 'Shop: Single Product',
  fields: {
    productSlug: { type: 'text' as const, label: 'Product slug' },
    layoutRef: layoutField,
  },
  defaultProps: { productSlug: '', layoutRef: null },
  render: ShopProductCard,
}
