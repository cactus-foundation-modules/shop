'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useAdminPath } from '@/components/admin/AdminPathContext'
import { useConfirm } from '@/modules/shop/components/admin/dialogs'
import { useProductUrlStyle } from '@/modules/shop/components/admin/use-product-url-style'
import { productHref } from '@/modules/shop/lib/product-url'

// The queue for "Ask a question" (migration 056): what shoppers have asked about
// a product, and where it gets answered.
//
// Answering does two things at once, which is the whole reason the feature sits
// with the FAQs rather than in an inbox: it emails the person who asked, and it
// writes the question and answer into that product's own FAQs so the next
// shopper never has to ask. Both are said on the button, because an answer that
// quietly appears on a public page is not a surprise anybody should get.

type Question = {
  id: string
  productId: string
  productName: string
  productSlug: string
  askerName: string | null
  askerEmail: string
  question: string
  status: 'PENDING' | 'ANSWERED' | 'REJECTED'
  answer: string | null
  answeredAt: string | null
  answeredByName: string | null
  publishedAt: string | null
  createdAt: string
}

type Filter = 'PENDING' | 'ANSWERED' | 'REJECTED' | 'ALL'

const FILTERS: Array<{ key: Filter; label: string }> = [
  { key: 'PENDING', label: 'Waiting' },
  { key: 'ANSWERED', label: 'Answered' },
  { key: 'REJECTED', label: 'Binned' },
  { key: 'ALL', label: 'All' },
]

const dateFormat = (value: string) =>
  new Date(value).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

export function ProductQuestionsScreen({ productId }: { productId?: string }) {
  const adminPath = useAdminPath()
  const urlStyle = useProductUrlStyle()
  const [confirm, confirmDialog] = useConfirm()

  const [filter, setFilter] = useState<Filter>('PENDING')
  const [questions, setQuestions] = useState<Question[]>([])
  const [pendingTotal, setPendingTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  // Which question's answer box is open, and what is in it. Kept as one open
  // box rather than a draft per row: two half-written answers on one screen is
  // two chances to send the wrong one.
  const [openId, setOpenId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  // Which load is the current one. A filter change landing while an older fetch
  // is still in flight would otherwise let the slower one win, and the list would
  // disagree with the tab that is lit.
  const loadSeq = useRef(0)

  const load = useCallback(async () => {
    const seq = ++loadSeq.current
    const params = new URLSearchParams()
    if (filter !== 'ALL') params.set('status', filter)
    if (productId) params.set('productId', productId)
    try {
      const res = await fetch(`/api/m/shop/admin/product-questions?${params}`)
      if (!res.ok) throw new Error('load failed')
      const data = (await res.json()) as { questions: Question[]; pendingTotal: number }
      if (seq !== loadSeq.current) return
      setQuestions(data.questions)
      setPendingTotal(data.pendingTotal)
    } catch {
      if (seq === loadSeq.current) setError('The questions could not be loaded.')
    } finally {
      if (seq === loadSeq.current) setLoading(false)
    }
  }, [filter, productId])

  // eslint-disable-next-line react-hooks/set-state-in-effect -- delegating to an async helper; every setState is after an await
  useEffect(() => { void load() }, [load])

  async function sendAnswer(question: Question) {
    if (!draft.trim() || busy) return
    setBusy(true)
    setError('')
    try {
      const res = await fetch(`/api/m/shop/admin/product-questions/${question.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answer: draft.trim() }),
      })
      const body = (await res.json().catch(() => null)) as { error?: string; published?: boolean } | null
      if (!res.ok) {
        // Nothing was sent and nothing was written - the route sends before it
        // records - so the draft stays exactly where it is, ready to try again.
        setError(body?.error || 'The answer could not be sent.')
        return
      }
      setOpenId(null)
      setDraft('')
      await load()
    } finally {
      setBusy(false)
    }
  }

  async function setStatus(question: Question, status: Question['status']) {
    setBusy(true)
    setError('')
    try {
      const res = await fetch(`/api/m/shop/admin/product-questions/${question.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      if (!res.ok) setError('That could not be saved.')
      else await load()
    } finally {
      setBusy(false)
    }
  }

  async function remove(question: Question) {
    const ok = await confirm({
      title: 'Delete this question?',
      message: `This removes the question and ${question.askerEmail} with it, for good. Any answer already on the product page stays where it is - take it off on the product's own FAQs tab if it should go too.`,
      confirmLabel: 'Delete',
      danger: true,
    })
    if (!ok) return
    setBusy(true)
    try {
      const res = await fetch(`/api/m/shop/admin/product-questions/${question.id}`, { method: 'DELETE' })
      if (!res.ok) setError('That could not be deleted.')
      else await load()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      {confirmDialog}
      <div className="page-header">
        <h1 className="page-title">Product questions</h1>
      </div>
      <p style={{ color: 'var(--color-text-secondary)', marginTop: 0 }}>
        What shoppers have asked on a product page. Answering emails them back and adds the question and your answer to
        that product&apos;s FAQs, where the next shopper will find it.
      </p>

      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', margin: '1rem 0' }}>
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            className={`btn btn-sm ${filter === f.key ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => { setFilter(f.key); setOpenId(null) }}
          >
            {f.label}
            {f.key === 'PENDING' && pendingTotal > 0 ? ` (${pendingTotal})` : ''}
          </button>
        ))}
        {productId && (
          <a className="btn btn-ghost btn-sm" href={`/${adminPath}/m/shop/questions`}>
            Showing one product only - show all
          </a>
        )}
      </div>

      {error && <div className="alert alert-danger" style={{ marginBottom: '1rem' }}>{error}</div>}

      {loading ? (
        <p style={{ color: 'var(--color-text-secondary)' }}>Loading…</p>
      ) : questions.length === 0 ? (
        <p style={{ color: 'var(--color-text-secondary)' }}>
          {filter === 'PENDING' ? 'Nothing waiting - every question has been dealt with.' : 'Nothing here.'}
        </p>
      ) : (
        <div style={{ display: 'grid', gap: '0.75rem' }}>
          {questions.map((q) => (
            <div key={q.id} style={{ border: '1px solid var(--color-border)', borderRadius: 8, padding: '1rem', display: 'grid', gap: '0.6rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
                <div style={{ display: 'grid', gap: '0.15rem' }}>
                  <strong style={{ fontSize: '0.9375rem' }}>
                    {q.productSlug ? (
                      <a href={productHref(q.productSlug, urlStyle)} target="_blank" rel="noreferrer">{q.productName}</a>
                    ) : (
                      q.productName
                    )}
                  </strong>
                  <span style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)' }}>
                    {q.askerName ? `${q.askerName} - ` : ''}
                    <a href={`mailto:${q.askerEmail}`}>{q.askerEmail}</a>
                    {' · '}
                    {dateFormat(q.createdAt)}
                  </span>
                </div>
                <span style={{ display: 'flex', gap: '0.35rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                  {q.status === 'PENDING' && <span className="badge">Waiting</span>}
                  {q.status === 'ANSWERED' && <span className="badge badge-success">Answered</span>}
                  {q.status === 'REJECTED' && <span className="badge">Binned</span>}
                  {q.status === 'ANSWERED' && !q.publishedAt && (
                    // Worth saying out loud: the answer went to the customer but
                    // never made it onto the page, so somebody looking for it
                    // there will not find it.
                    <span className="badge" title="Emailed, but not added to the product's FAQs - the question was already answered there, too long to use as a FAQ heading, or the product has gone.">
                      Not on the page
                    </span>
                  )}
                </span>
              </div>

              <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{q.question}</p>

              {q.answer && (
                <div style={{ borderLeft: '3px solid var(--color-border)', paddingLeft: '0.75rem' }}>
                  <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{q.answer}</p>
                  <span style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>
                    Answered{q.answeredByName ? ` by ${q.answeredByName}` : ''}{q.answeredAt ? `, ${dateFormat(q.answeredAt)}` : ''}
                    {q.publishedAt ? ' · added to the product FAQs' : ''}
                  </span>
                </div>
              )}

              {openId === q.id ? (
                <div style={{ display: 'grid', gap: '0.5rem' }}>
                  <textarea
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    rows={5}
                    placeholder="Write the answer as you would like it to read on the product page - it goes to both."
                    style={{
                      width: '100%', padding: '0.5rem', borderRadius: 6, border: '1px solid var(--color-border)',
                      background: 'var(--color-bg)', color: 'var(--color-text)', font: 'inherit', resize: 'vertical',
                    }}
                  />
                  <span style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                    <button type="button" className="btn btn-primary btn-sm" disabled={busy || !draft.trim()} onClick={() => void sendAnswer(q)}>
                      {busy ? 'Sending…' : 'Email the answer and add it to the FAQs'}
                    </button>
                    <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => { setOpenId(null); setDraft('') }}>
                      Cancel
                    </button>
                  </span>
                </div>
              ) : (
                <span style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  {q.status !== 'ANSWERED' && (
                    <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => { setOpenId(q.id); setDraft('') }}>
                      Answer
                    </button>
                  )}
                  {q.status === 'PENDING' && (
                    <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => void setStatus(q, 'REJECTED')}>
                      Bin it
                    </button>
                  )}
                  {q.status !== 'PENDING' && (
                    <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => void setStatus(q, 'PENDING')}>
                      Put back in the queue
                    </button>
                  )}
                  <button type="button" className="btn btn-ghost btn-sm" style={{ color: 'var(--color-danger)' }} disabled={busy} onClick={() => void remove(q)}>
                    Delete
                  </button>
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
