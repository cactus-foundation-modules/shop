'use client'

import { useId, useState } from 'react'

// "Ask a question", under the questions in a product's FAQs section.
//
// A button first, a form only once it is pressed. The section's job is to answer
// questions, not to collect them, and a permanently open three-field form under
// every product's FAQs would say the opposite.
//
// Styling is scoped and local, the way every other island on this page is
// (.sbis, .spd-*): the section it sits in is dressed by the product page's own
// <style>, and this has to look at home there without reaching into it.
const SPQ_CSS = `
.spq{margin-top:14px}
.spq-open{display:block;margin:0 auto;border:1px solid var(--color-border);border-radius:8px;background:transparent;color:var(--color-fg);padding:9px 16px;font:inherit;font-weight:600;font-size:14px;cursor:pointer;transition:background .12s ease}
.spq-open:hover{background:var(--color-surface)}
.spq-form{border:1px solid var(--color-border);border-radius:12px;background:var(--color-surface);padding:16px;display:grid;gap:10px}
.spq-intro{margin:0;font-size:13px;color:var(--color-text-muted)}
.spq-row{display:grid;gap:10px;grid-template-columns:1fr 1fr}
@media (max-width:560px){.spq-row{grid-template-columns:1fr}}
.spq-field{display:grid;gap:4px}
.spq-label{font-size:12px;color:var(--color-text-muted)}
.spq-input,.spq-textarea{width:100%;padding:10px 12px;border-radius:8px;border:1px solid var(--color-border);background:var(--color-bg,var(--color-surface));color:var(--color-fg);font:inherit;font-size:15px}
.spq-textarea{resize:vertical;min-height:96px}
.spq-input:focus,.spq-textarea:focus{outline:2px solid var(--color-primary);outline-offset:0;border-color:var(--color-primary)}
.spq-actions{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
.spq-send{border:none;border-radius:8px;background:var(--color-primary);color:var(--color-on-primary);padding:0 18px;height:42px;font:inherit;font-weight:600;cursor:pointer;transition:filter .12s ease}
.spq-send:hover:not(:disabled){filter:brightness(.94)}
.spq-send:disabled{opacity:.6;cursor:not-allowed}
.spq-cancel{border:none;background:none;color:var(--color-text-muted);font:inherit;font-size:14px;cursor:pointer;text-decoration:underline}
.spq-note{margin:0;font-size:13px;color:var(--color-text-muted)}
.spq-error{margin:0;font-size:13px;color:var(--color-danger,#c0392b)}
.spq-hp{position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden}
`

export function AskProductQuestion({ productId, buttonLabel, intro, thanks, open: openProp, onOpenChange }: {
  productId: string
  buttonLabel: string
  intro: string
  thanks: string
  /** Controlled mode. Left out, the button below opens the form and closes it
   *  again, exactly as it always has. Supplied, the caller owns that state -
   *  which is how the FAQ search box's "Ask a new question" link opens this form
   *  without the shopper having to find and press the button as well. */
  open?: boolean
  onOpenChange?: (open: boolean) => void
}) {
  const [openSelf, setOpenSelf] = useState(false)
  const open = openProp ?? openSelf
  const setOpen = (next: boolean) => {
    if (openProp === undefined) setOpenSelf(next)
    onOpenChange?.(next)
  }
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [question, setQuestion] = useState('')
  // The honeypot's value. Never shown, never filled by a person.
  const [website, setWebsite] = useState('')
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [error, setError] = useState('')
  // Ids rather than wrapping <label>s around the fields: this markup lands
  // inside a product page that may hold several of these (a bundle's parts), and
  // duplicate ids would point every label at the first form's inputs.
  const uid = useId()

  const canSend = email.trim().length > 0 && question.trim().length >= 5 && status !== 'sending'

  async function submit() {
    if (!canSend) return
    setStatus('sending')
    setError('')
    try {
      const res = await fetch('/api/m/shop/public/product-questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId, email: email.trim(), name: name.trim() || undefined, question: question.trim(), website: website || undefined }),
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null
        setError(body?.error || 'Your question could not be sent. Please try again.')
        setStatus('error')
        return
      }
      setStatus('sent')
    } catch {
      setError('Your question could not be sent. Please try again.')
      setStatus('error')
    }
  }

  if (status === 'sent') {
    return (
      <div className="spq">
        <style dangerouslySetInnerHTML={{ __html: SPQ_CSS }} />
        <p className="spq-note">{thanks}</p>
      </div>
    )
  }

  return (
    <div className="spq">
      <style dangerouslySetInnerHTML={{ __html: SPQ_CSS }} />
      {!open ? (
        <button type="button" className="spq-open" onClick={() => setOpen(true)}>
          {buttonLabel}
        </button>
      ) : (
        <div className="spq-form">
          <p className="spq-intro">{intro}</p>
          <div className="spq-row">
            <span className="spq-field">
              <label className="spq-label" htmlFor={`${uid}-name`}>Your name (optional)</label>
              <input id={`${uid}-name`} className="spq-input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
            </span>
            <span className="spq-field">
              <label className="spq-label" htmlFor={`${uid}-email`}>Your email</label>
              <input id={`${uid}-email`} className="spq-input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
            </span>
          </div>
          <span className="spq-field">
            <label className="spq-label" htmlFor={`${uid}-q`}>Your question</label>
            <textarea id={`${uid}-q`} className="spq-textarea" value={question} onChange={(e) => setQuestion(e.target.value)} />
          </span>
          {/* The honeypot. aria-hidden and off-tab as well as off-screen, so a
              screen reader never announces a field nobody should fill. */}
          <span className="spq-hp" aria-hidden="true">
            <label htmlFor={`${uid}-website`}>Website</label>
            <input id={`${uid}-website`} tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
          </span>
          <div className="spq-actions">
            <button type="button" className="spq-send" onClick={submit} disabled={!canSend}>
              {status === 'sending' ? 'Sending…' : 'Send question'}
            </button>
            <button type="button" className="spq-cancel" onClick={() => setOpen(false)}>Cancel</button>
          </div>
          {error && <p className="spq-error">{error}</p>}
          <p className="spq-note">We only use your email address to answer your question.</p>
        </div>
      )}
    </div>
  )
}
