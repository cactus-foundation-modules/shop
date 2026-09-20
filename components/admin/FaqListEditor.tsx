'use client'

import type { CSSProperties } from 'react'
import type { ShpFaqItem } from '@/modules/shop/lib/faq'

// The question/answer list editor, shared by the Categories screen and the shop
// settings screen. The product editor has its own, built out of that editor's
// field primitives - these two screens have no such primitives and would
// otherwise have grown two copies of the same eight buttons.
//
// An answer may be plain writing or a fragment of HTML. Nothing decides which
// here either - the text answers for itself on the way to the page (lib/faq.ts),
// and what it prints is cleaned there (lib/faq-render.ts).
//
// Order is the print order, so rows move rather than needing to be retyped.
// Nothing is validated here: a half-written row is dropped on the way into the
// database (lib/faq.ts), which is the one place that decision belongs.

const input: CSSProperties = {
  padding: '0.375rem 0.5rem', border: '1px solid var(--color-border)', borderRadius: 6,
  fontSize: '0.875rem', fontFamily: 'inherit', background: 'var(--color-bg)', color: 'var(--color-text)',
  width: '100%',
}

const label: CSSProperties = { fontSize: '0.75rem', color: 'var(--color-text-secondary)' }

export function FaqListEditor({ items, onChange, emptyNote, addLabel = 'Add a question' }: {
  items: ShpFaqItem[]
  onChange: (next: ShpFaqItem[]) => void
  /** What to say when there is nothing in the list yet. */
  emptyNote: string
  addLabel?: string
}) {
  const setItem = (index: number, part: Partial<ShpFaqItem>) =>
    onChange(items.map((item, i) => (i === index ? { ...item, ...part } : item)))

  const move = (index: number, by: -1 | 1) => {
    const to = index + by
    if (to < 0 || to >= items.length) return
    const next = [...items]
    const moved = next[index]
    const displaced = next[to]
    if (!moved || !displaced) return
    next[index] = displaced
    next[to] = moved
    onChange(next)
  }

  return (
    <div style={{ display: 'grid', gap: '0.75rem' }}>
      {items.length === 0 && (
        <p style={{ ...label, margin: 0 }}>{emptyNote}</p>
      )}
      {items.map((item, index) => (
        <div key={index} style={{ border: '1px solid var(--color-border)', borderRadius: 8, padding: '0.75rem', display: 'grid', gap: '0.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
            <strong style={{ fontSize: '0.8125rem' }}>Question {index + 1}</strong>
            <span style={{ display: 'flex', gap: '0.125rem' }}>
              <button type="button" className="btn btn-ghost btn-sm" style={{ padding: '0 0.375rem' }} disabled={index === 0} onClick={() => move(index, -1)} aria-label={`Move question ${index + 1} up`}>↑</button>
              <button type="button" className="btn btn-ghost btn-sm" style={{ padding: '0 0.375rem' }} disabled={index === items.length - 1} onClick={() => move(index, 1)} aria-label={`Move question ${index + 1} down`}>↓</button>
              <button type="button" className="btn btn-ghost btn-sm" style={{ color: 'var(--color-danger)' }} onClick={() => onChange(items.filter((_, i) => i !== index))} aria-label={`Remove question ${index + 1}`}>Remove</button>
            </span>
          </div>
          <label style={{ display: 'grid', gap: '0.25rem' }}>
            <span style={label}>Question</span>
            <input
              value={item.question}
              onChange={(e) => setItem(index, { question: e.target.value })}
              placeholder="How long does delivery take?"
              style={input}
            />
          </label>
          <label style={{ display: 'grid', gap: '0.25rem' }}>
            <span style={label}>Answer</span>
            <textarea
              value={item.answer}
              onChange={(e) => setItem(index, { answer: e.target.value })}
              rows={4}
              placeholder="Most things leave us within three working days."
              style={{ ...input, resize: 'vertical' }}
            />
            {index === 0 && (
              <span style={label}>
                Plain writing is fine, and line breaks are kept. If you want a link, a list or a bit of bold, you can
                type HTML here and it will be shown as such.
              </span>
            )}
          </label>
        </div>
      ))}
      <div>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => onChange([...items, { question: '', answer: '' }])}>
          {addLabel}
        </button>
      </div>
    </div>
  )
}
