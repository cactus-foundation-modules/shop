'use client'

import { useEffect, useState } from 'react'

type Review = { id: string; productId: string; authorName: string; rating: number; title: string | null; body: string | null; status: string; isVerified: boolean }

export function ReviewsScreen() {
  const [reviews, setReviews] = useState<Review[]>([])
  const [filter, setFilter] = useState<'PENDING' | 'APPROVED' | 'REJECTED'>('PENDING')

  function refresh() {
    fetch(`/api/m/shop/admin/reviews?status=${filter}`).then(async (r) => { if (r.ok) setReviews((await r.json()).reviews) })
  }
  useEffect(refresh, [filter])

  async function setStatus(id: string, status: string) {
    await fetch(`/api/m/shop/admin/reviews/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) })
    refresh()
  }

  async function remove(id: string) {
    if (!confirm('Delete this review?')) return
    await fetch(`/api/m/shop/admin/reviews/${id}`, { method: 'DELETE' })
    refresh()
  }

  return (
    <div>
      <div className="page-header"><h1 className="page-title">Reviews</h1></div>
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
        {(['PENDING', 'APPROVED', 'REJECTED'] as const).map((s) => (
          <button key={s} onClick={() => setFilter(s)} style={{ fontWeight: filter === s ? 700 : 400, background: 'none', border: 'none', cursor: 'pointer' }}>{s}</button>
        ))}
      </div>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '0.75rem' }}>
        {reviews.map((r) => (
          <li key={r.id} style={{ border: '1px solid var(--color-border)', borderRadius: 8, padding: '0.75rem 1rem' }}>
            <div style={{ fontWeight: 600 }}>{r.authorName} {r.isVerified && '(verified)'} - {'★'.repeat(r.rating)}</div>
            {r.title && <div style={{ fontWeight: 600 }}>{r.title}</div>}
            {r.body && <p>{r.body}</p>}
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              {r.status !== 'APPROVED' && <button onClick={() => setStatus(r.id, 'APPROVED')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-primary)' }}>Approve</button>}
              {r.status !== 'REJECTED' && <button onClick={() => setStatus(r.id, 'REJECTED')} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>Reject</button>}
              <button onClick={() => remove(r.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-danger, #c00)' }}>Delete</button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
