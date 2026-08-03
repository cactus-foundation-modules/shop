'use client'

import { useState } from 'react'

// A one-off message to the person who placed this order - "your sofa is stuck
// in Dover", the sort of thing no status change covers. The send is logged
// against the order like every automatic email, so the order's history stays
// the whole story rather than most of it.
//
// The message is typed as plain text and turned into HTML here, escaped first:
// an owner typing "6 < 10" or an ampersand in a company name should see it come
// out the other side, not lose half the sentence to a stray tag.
function textToHtml(text: string): string {
  const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return escaped.split(/\n{2,}/).map((para) => `<p>${para.replace(/\n/g, '<br />')}</p>`).join('')
}

export function EmailCustomerModal({ orderId, orderNumber, customerEmail, customerName, onClose, onDone }: {
  orderId: string
  orderNumber: string
  customerEmail: string
  customerName: string
  onClose: () => void
  onDone: () => void
}) {
  const [subject, setSubject] = useState(`Your order ${orderNumber}`)
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function send() {
    if (!subject.trim() || !body.trim()) return
    setSending(true)
    setError(null)
    const res = await fetch(`/api/m/shop/admin/orders/${orderId}/email`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subject: subject.trim(), body: textToHtml(body.trim()) }),
    })
    setSending(false)
    if (!res.ok) {
      setError(((await res.json().catch(() => ({}))) as { error?: string }).error ?? 'That message could not be sent.')
      return
    }
    onDone()
  }

  return (
    <div style={overlay} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-labelledby="shop-email-title" style={card}>
        <div style={head}>
          <h3 id="shop-email-title" style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>Email the customer</h3>
          <button type="button" aria-label="Close" onClick={onClose} style={closeButton}>×</button>
        </div>
        <div style={{ padding: '1.25rem', overflowY: 'auto', display: 'grid', gap: '0.75rem' }}>
          <p style={{ margin: 0, fontSize: '0.8125rem', color: 'var(--color-text-muted)' }}>
            Goes to {customerName} at {customerEmail}, from your shop&apos;s usual sending address. It is added to this order&apos;s history.
          </p>
          {error && <p style={{ margin: 0, color: 'var(--color-error)', fontSize: '0.875rem' }}>{error}</p>}
          <label style={label}>
            Subject
            <input value={subject} onChange={(e) => setSubject(e.target.value)} style={field} />
          </label>
          <label style={label}>
            Message
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={9}
              placeholder="Hello…"
              style={{ ...field, minHeight: 160, fontFamily: 'inherit', resize: 'vertical' }}
            />
          </label>
        </div>
        <div style={foot}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button type="button" className="btn btn-primary" disabled={sending || !subject.trim() || !body.trim()} onClick={send}>
            {sending ? 'Sending…' : 'Send message'}
          </button>
        </div>
      </div>
    </div>
  )
}

const overlay: React.CSSProperties = { position: 'fixed', inset: 0, zIndex: 10000, background: 'var(--color-overlay)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }
const card: React.CSSProperties = { background: 'var(--color-surface)', borderRadius: 8, width: '90vw', maxWidth: 560, maxHeight: '85vh', display: 'flex', flexDirection: 'column', boxShadow: '0 25px 50px -12px rgba(0,0,0,.25)' }
const head: React.CSSProperties = { padding: '1rem 1.25rem', borderBottom: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }
const foot: React.CSSProperties = { padding: '0.75rem 1.25rem', borderTop: '1px solid var(--color-border)', display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }
const closeButton: React.CSSProperties = { background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.25rem', color: 'var(--color-text-muted)' }
const label: React.CSSProperties = { display: 'grid', gap: '0.25rem', fontSize: '0.875rem' }
const field: React.CSSProperties = { width: '100%', padding: '0.5rem 0.625rem', borderRadius: 6, border: '1px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text)', fontSize: '0.875rem' }
