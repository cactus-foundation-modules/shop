'use client'

import { useState } from 'react'

export function ReviewForm({ productId }: { productId: string }) {
  const [rating, setRating] = useState(5)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [status, setStatus] = useState<'idle' | 'submitting' | 'submitted' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    setStatus('submitting')
    setError(null)
    const res = await fetch('/api/m/shop/public/reviews', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productId, rating, title: title || undefined, body: body || undefined }),
    })
    if (res.ok) { setStatus('submitted'); return }
    const data = await res.json()
    setError(data.error ?? 'Could not submit review')
    setStatus('error')
  }

  if (status === 'submitted') return <p style={{ color: 'var(--color-text-muted)' }}>Thanks - your review is awaiting moderation.</p>

  return (
    <div style={{ display: 'grid', gap: '0.5rem', marginTop: '1rem', maxWidth: 400 }}>
      <h3 style={{ fontSize: '1rem', margin: 0 }}>Leave a review</h3>
      {error && <p style={{ color: 'var(--color-danger, #c00)' }}>{error}</p>}
      <select value={rating} onChange={(e) => setRating(Number(e.target.value))} style={{ padding: '0.5rem', borderRadius: 6, border: '1px solid var(--color-border)' }}>
        {[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n} star{n === 1 ? '' : 's'}</option>)}
      </select>
      <input placeholder="Title (optional)" value={title} onChange={(e) => setTitle(e.target.value)} style={{ padding: '0.5rem 0.75rem', borderRadius: 6, border: '1px solid var(--color-border)' }} />
      <textarea placeholder="Your review (optional)" value={body} onChange={(e) => setBody(e.target.value)} style={{ padding: '0.5rem 0.75rem', borderRadius: 6, border: '1px solid var(--color-border)', minHeight: 80 }} />
      <button
        onClick={submit} disabled={status === 'submitting'}
        style={{ background: 'var(--color-primary)', color: 'var(--color-primary-contrast, #fff)', border: 'none', borderRadius: 8, padding: '0.5rem 1rem', fontWeight: 600, cursor: 'pointer', justifySelf: 'start' }}
      >
        Submit review
      </button>
    </div>
  )
}
