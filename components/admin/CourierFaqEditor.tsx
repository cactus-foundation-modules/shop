'use client'

import { useEffect, useState } from 'react'
import { ArrowDownIcon, ArrowUpIcon, ChevronDownIcon, SaveIcon, TrashIcon } from '@/modules/shop/components/admin/courier-icons'
import { CrossIcon, PenIcon } from '@/modules/shop/components/admin/order-icons'
import type { ShpConfig } from '@/modules/shop/lib/config'

// A courier's delivery questions, inside the courier modal.
//
// A saved question reads as text, not as a form: the question on one line, its
// answer folded away under a chevron, a pencil to change it. Ten open
// textareas is what this replaced, and finding the one you wanted to change
// meant reading all ten. Editing one turns that row into boxes; the pencil
// becomes a save once something has actually changed.
//
// Every change here - a saved edit, a removal, a move - goes through
// `onCommit` with the whole new list, and the modal decides what that means:
// saved straight away for a courier that exists, kept with the draft for one
// that has not been added yet.

type Faq = ShpConfig['deliveryCouriers'][number]['faqs'][number]

function FaqRow({ faq, index, count, startEditing, busy, onSave, onDiscardNew, onRemove, onMove, onUnsaved }: {
  faq: Faq
  index: number
  count: number
  startEditing: boolean
  busy: boolean
  onSave: (next: Faq) => Promise<boolean>
  onDiscardNew: () => void
  onRemove: () => void
  onMove: (by: -1 | 1) => void
  onUnsaved: (id: string, unsaved: boolean) => void
}) {
  const [editing, setEditing] = useState(startEditing)
  const [open, setOpen] = useState(false)
  const [question, setQuestion] = useState(faq.question)
  const [answer, setAnswer] = useState(faq.answer)
  const [problem, setProblem] = useState('')

  const changed = question !== faq.question || answer !== faq.answer
  const isUnsavedNew = !faq.question && !faq.answer
  const unsaved = editing && changed

  // Told upward so the modal's "discard your changes?" covers a question being
  // typed, not just the courier's own fields.
  useEffect(() => {
    onUnsaved(faq.id, unsaved)
    return () => onUnsaved(faq.id, false)
  }, [faq.id, unsaved, onUnsaved])

  function stopEditing() {
    if (isUnsavedNew) { onDiscardNew(); return }
    setQuestion(faq.question)
    setAnswer(faq.answer)
    setProblem('')
    setEditing(false)
  }

  async function save() {
    const q = question.trim()
    const a = answer.trim()
    if (!q || !a) { setProblem('A question needs both a question and an answer.'); return }
    setProblem('')
    if (await onSave({ ...faq, question: q, answer: a })) setEditing(false)
  }

  const answerId = `scr-faq-answer-${faq.id}`

  if (editing) {
    return (
      <li className="scr-faq scr-faq--editing">
        <div className="field">
          <label htmlFor={`scr-q-${faq.id}`}>Question</label>
          <input
            id={`scr-q-${faq.id}`}
            type="text"
            value={question}
            maxLength={200}
            placeholder="Will they take it upstairs?"
            autoFocus
            onChange={(e) => setQuestion(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor={`scr-a-${faq.id}`}>Answer</label>
          <textarea
            id={`scr-a-${faq.id}`}
            rows={3}
            value={answer}
            maxLength={4000}
            onChange={(e) => setAnswer(e.target.value)}
          />
        </div>
        <div className="scr-faq-edit-actions">
          {problem && <span className="scr-status scr-status--err" role="alert">{problem}</span>}
          <button
            type="button"
            className="scr-icon-btn"
            aria-label={isUnsavedNew && !changed ? 'Remove this question' : 'Stop editing without saving'}
            title={isUnsavedNew && !changed ? 'Remove' : 'Cancel'}
            disabled={busy}
            onClick={stopEditing}
          >
            {CrossIcon}
          </button>
          {changed && (
            <button
              type="button"
              className="scr-icon-btn scr-icon-btn--primary"
              aria-label="Save this question"
              title="Save"
              disabled={busy}
              onClick={save}
            >
              {SaveIcon}
            </button>
          )}
        </div>
      </li>
    )
  }

  return (
    <li className="scr-faq">
      <div className="scr-faq-line">
        <button
          type="button"
          className="scr-faq-toggle"
          aria-expanded={open}
          aria-controls={answerId}
          onClick={() => setOpen((o) => !o)}
        >
          <span className={`scr-chevron${open ? ' scr-chevron--open' : ''}`}>{ChevronDownIcon}</span>
          <span className="scr-faq-question">{faq.question}</span>
        </button>
        <div className="scr-faq-actions">
          <button type="button" className="scr-icon-btn" aria-label="Move up" title="Move up" disabled={busy || index === 0} onClick={() => onMove(-1)}>
            {ArrowUpIcon}
          </button>
          <button type="button" className="scr-icon-btn" aria-label="Move down" title="Move down" disabled={busy || index === count - 1} onClick={() => onMove(1)}>
            {ArrowDownIcon}
          </button>
          <button type="button" className="scr-icon-btn" aria-label={`Edit "${faq.question}"`} title="Edit" disabled={busy} onClick={() => setEditing(true)}>
            {PenIcon}
          </button>
          <button type="button" className="scr-icon-btn scr-icon-btn--danger" aria-label={`Remove "${faq.question}"`} title="Remove" disabled={busy} onClick={onRemove}>
            {TrashIcon}
          </button>
        </div>
      </div>
      {open && <p id={answerId} className="scr-faq-answer">{faq.answer}</p>}
    </li>
  )
}

export function CourierFaqEditor({ faqs, busy, onCommit, onRemoveAsk, newFaqId, onUnsaved }: {
  faqs: Faq[]
  busy: boolean
  /** Hands back the whole new list. Resolves true once it has stuck. */
  onCommit: (next: Faq[]) => Promise<boolean>
  /** Asks before a saved question is removed. */
  onRemoveAsk: (faq: Faq) => Promise<boolean>
  newFaqId: () => string
  /** Whether any question is being edited with changes not yet saved. Must be
   *  a stable function: it is an effect dependency on every row. */
  onUnsaved: (id: string, unsaved: boolean) => void
}) {
  // A question added here but not yet saved. Kept out of `faqs` until it has a
  // question and an answer, so a half-typed one is never saved with the rest.
  const [draft, setDraft] = useState<Faq | null>(null)

  async function move(index: number, by: -1 | 1) {
    const next = [...faqs]
    const target = index + by
    if (target < 0 || target >= next.length) return
    ;[next[index], next[target]] = [next[target]!, next[index]!]
    await onCommit(next)
  }

  return (
    <>
      {(faqs.length > 0 || draft) && (
        <ol className="scr-faqs">
          {faqs.map((faq, i) => (
            <FaqRow
              key={faq.id}
              faq={faq}
              index={i}
              count={faqs.length}
              startEditing={false}
              busy={busy}
              onSave={(next) => onCommit(faqs.map((f) => (f.id === next.id ? next : f)))}
              onDiscardNew={() => undefined}
              onRemove={async () => {
                if (await onRemoveAsk(faq)) await onCommit(faqs.filter((f) => f.id !== faq.id))
              }}
              onMove={(by) => move(i, by)}
              onUnsaved={onUnsaved}
            />
          ))}
          {draft && (
            <FaqRow
              key={draft.id}
              faq={draft}
              index={faqs.length}
              count={faqs.length + 1}
              startEditing
              busy={busy}
              onSave={async (next) => {
                const ok = await onCommit([...faqs, next])
                if (ok) setDraft(null)
                return ok
              }}
              onDiscardNew={() => setDraft(null)}
              onRemove={() => setDraft(null)}
              onMove={() => undefined}
              onUnsaved={onUnsaved}
            />
          )}
        </ol>
      )}
      {!draft && (
        <div>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            disabled={busy}
            onClick={() => setDraft({ id: newFaqId(), question: '', answer: '' })}
          >
            + Add a question
          </button>
        </div>
      )}
    </>
  )
}
