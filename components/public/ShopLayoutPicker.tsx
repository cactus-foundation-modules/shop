'use client'

import { useEffect, useState } from 'react'
import type { LayoutRef } from '@/lib/puck/LayoutPickerField'

// Per-block "Layout" override field for the Product Detail / Product Grid
// blocks. Reuses the same /api/admin/layouts source as the core LayoutPickerField
// but filters to a single shop layout type, so the Product Detail block only
// offers Product Detail layouts and the grid only offers Product Card layouts.
// "Use shop default" clears the override and the block falls back to the
// published default for that type.

type LayoutRow = { id: string; name: string; type: string; status: string }

type Props = {
  type: string
  value: LayoutRef | null | undefined
  onChange: (value: LayoutRef | null) => void
}

export function ShopLayoutPicker({ type, value, onChange }: Props) {
  const [layouts, setLayouts] = useState<LayoutRow[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    fetch('/api/admin/layouts')
      .then((r) => r.json())
      .then((d) => {
        const rows: LayoutRow[] = Array.isArray(d.layouts) ? d.layouts : []
        setLayouts(rows.filter((l) => l.type === type))
      })
      .catch(() => {})
      .finally(() => setLoaded(true))
  }, [type])

  const selectStyle: React.CSSProperties = {
    width: '100%',
    padding: '0.5rem',
    borderRadius: 6,
    border: '1px solid var(--color-border)',
    background: 'var(--color-bg)',
    color: 'var(--color-text)',
    fontSize: '0.875rem',
  }

  if (loaded && layouts.length === 0) {
    return (
      <p style={{ margin: 0, fontSize: '0.8125rem', color: 'var(--color-text-muted)' }}>
        Using the shop default. Publish a layout of this type under Layouts &gt; Shop to offer alternatives here.
      </p>
    )
  }

  return (
    <select
      style={selectStyle}
      value={value?.id ?? ''}
      onChange={(e) => {
        const id = e.target.value
        if (!id) return onChange(null)
        const row = layouts.find((l) => l.id === id)
        if (row) onChange({ id: row.id, type: row.type, name: row.name })
      }}
    >
      <option value="">Use shop default</option>
      {layouts.map((l) => (
        <option key={l.id} value={l.id}>
          {l.name}
          {l.status !== 'published' ? ' (draft)' : ''}
        </option>
      ))}
    </select>
  )
}
