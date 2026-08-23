'use client'

import { useState, type ReactNode } from 'react'

// The Orders filter, for the copy of the order history that lives inside the
// one-page account. The Orders PAGE filters through the URL instead - there is
// no state there the address bar cannot hold, and an order history that works
// with JavaScript off is one fewer thing to go wrong on somebody's locked-down
// work laptop. On the one page the address bar is already spoken for by the
// section anchors, so this holds it in the browser and nothing navigates.
//
// The cards arrive already rendered, so the whole list is still built on the
// server: this only decides which of them are on screen.

export type OrdersBucket = 'open' | 'complete' | 'cancelled'

const FILTERS: { key: 'all' | OrdersBucket; label: string }[] = [
  { key: 'all', label: 'All orders' },
  { key: 'open', label: 'In progress' },
  { key: 'complete', label: 'Completed' },
  { key: 'cancelled', label: 'Cancelled' },
]

export function OrdersFilterList({ items }: { items: { id: string; bucket: OrdersBucket; card: ReactNode }[] }) {
  const [filter, setFilter] = useState<'all' | OrdersBucket>('all')
  const visible = filter === 'all' ? items : items.filter((item) => item.bucket === filter)

  return (
    <>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: 'var(--space-4)' }}>
        {FILTERS.map((option) => {
          const count = option.key === 'all' ? items.length : items.filter((i) => i.bucket === option.key).length
          const active = option.key === filter
          return (
            <button
              key={option.key}
              type="button"
              onClick={() => setFilter(option.key)}
              style={{
                padding: '0.375rem 0.75rem',
                borderRadius: 'var(--radius-full)',
                border: `1px solid ${active ? 'var(--color-primary)' : 'var(--color-border)'}`,
                background: active ? 'var(--color-primary-subtle)' : 'transparent',
                color: active ? 'var(--color-primary-dark)' : 'var(--color-text-muted)',
                fontSize: 'var(--text-sm)',
                fontFamily: 'inherit',
                fontWeight: active ? 'var(--font-semibold)' : 'var(--font-normal)',
                cursor: 'pointer',
              }}
            >
              {option.label} ({count})
            </button>
          )
        })}
      </div>

      {visible.length === 0 && <p style={{ color: 'var(--color-text-muted)' }}>No orders match that filter.</p>}

      <div style={{ display: 'grid', gap: 'var(--space-3)' }}>
        {visible.map((item) => (
          <div key={item.id}>{item.card}</div>
        ))}
      </div>
    </>
  )
}
