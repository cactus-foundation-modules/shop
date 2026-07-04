'use client'

import { useState } from 'react'

const SBIS_CSS = `
.sbis{border:1px solid var(--color-border);border-radius:12px;background:var(--color-surface);padding:18px 20px;max-width:520px}
.sbis-h{font-weight:600;font-size:15px;color:var(--color-fg);margin:0 0 4px}
.sbis-p{font-size:13px;color:var(--color-text-muted);margin:0 0 12px}
.sbis-row{display:flex;gap:10px;flex-wrap:wrap}
.sbis-input{flex:1;min-width:180px;padding:11px 14px;border-radius:8px;border:1px solid var(--color-border);background:var(--color-surface);color:var(--color-fg);font:inherit;font-size:15px}
.sbis-input:focus{outline:2px solid var(--color-primary);outline-offset:0;border-color:var(--color-primary)}
.sbis-btn{border:none;border-radius:8px;background:var(--color-primary);color:var(--color-on-primary);padding:0 18px;height:44px;font:inherit;font-weight:600;cursor:pointer;transition:filter .12s ease}
.sbis-btn:hover:not(:disabled){filter:brightness(.94)}
.sbis-btn:disabled{opacity:.6;cursor:not-allowed}
.sbis-ok{color:var(--color-text-muted);font-size:14px;margin:0}
`

// Client island for the back-in-stock form. Registered Puck block wrapper is a
// server component (ShopBackInStockForm) that passes plain props in here, so
// Puck's RSC <Render> never has to serialise a function into a client boundary.
export function BackInStockClient({ productId, buttonLabel, heading }: { productId?: string; buttonLabel?: string; heading?: string }) {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'submitting' | 'submitted' | 'error'>('idle')

  async function submit() {
    if (!productId || !email) return
    setStatus('submitting')
    const res = await fetch('/api/m/shop/public/back-in-stock', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ productId, email }),
    })
    setStatus(res.ok ? 'submitted' : 'error')
  }

  return (
    <div className="sbis">
      <style dangerouslySetInnerHTML={{ __html: SBIS_CSS }} />
      <p className="sbis-h">{heading || 'Out of stock'}</p>
      {status === 'submitted' ? (
        <p className="sbis-ok">Thanks - we&apos;ll email you the moment it&apos;s back.</p>
      ) : (
        <>
          <p className="sbis-p">Pop your email in and we&apos;ll let you know when it&apos;s back in stock.</p>
          <div className="sbis-row">
            <input
              type="email"
              className="sbis-input"
              placeholder="Your email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <button className="sbis-btn" onClick={submit} disabled={status === 'submitting'}>
              {buttonLabel || 'Notify me'}
            </button>
          </div>
          {status === 'error' && <p className="sbis-p" style={{ marginTop: 10 }}>Something went wrong. Please try again.</p>}
        </>
      )}
    </div>
  )
}
