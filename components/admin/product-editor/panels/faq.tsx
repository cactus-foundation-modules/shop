'use client'

import { Control, EmptyNote, Field, Section, Switch, TextArea } from '@/modules/shop/components/admin/product-editor/fields'
import type { PanelProps } from '@/modules/shop/components/admin/product-editor/model'
import type { ShpFaqItem } from '@/modules/shop/lib/faq'

/**
 * The product's own frequently asked questions, plus the one decision about the
 * shared ones: show them with these, or not at all.
 *
 * The questions written here appear in a FAQs section on the product page, below
 * Dimensions and above Downloads, with a link of its own in the page's section
 * strip. Nothing here, nothing on the category and nothing shop-wide means no
 * section at all - an empty accordion is worse than no accordion.
 */
export function FaqPanel({ state, patch }: PanelProps) {
  const { items, inherit } = state.faqs

  const setItems = (next: ShpFaqItem[]) =>
    patch((s) => ({ ...s, faqs: { ...s.faqs, items: next } }))

  const setItem = (index: number, part: Partial<ShpFaqItem>) =>
    setItems(items.map((item, i) => (i === index ? { ...item, ...part } : item)))

  const remove = (index: number) => setItems(items.filter((_, i) => i !== index))

  // Order is the print order, so it needs to be changeable without retyping
  // both boxes. Clamped rather than wrapped: the top question jumping to the
  // bottom is never what the click meant.
  const move = (index: number, by: -1 | 1) => {
    const to = index + by
    if (to < 0 || to >= items.length) return
    const next = [...items]
    const moved = next[index]
    const displaced = next[to]
    if (!moved || !displaced) return
    next[index] = displaced
    next[to] = moved
    setItems(next)
  }

  return (
    <div className="spe-panel">
      <Section
        title="Questions about this product"
        blurb="Answers to the things people keep asking. They appear in a FAQs section on the product page, and search engines can quote them."
        actions={
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setItems([...items, { question: '', answer: '' }])}>
            Add a question
          </button>
        }
      >
        {items.length === 0 ? (
          <EmptyNote>
            No questions written for this product yet. It can still show the ones written for its category and for the
            whole shop - see below.
          </EmptyNote>
        ) : (
          <div style={{ display: 'grid', gap: '0.75rem' }}>
            {items.map((item, index) => (
              <div key={index} className="spe-card">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', marginBottom: '0.5rem' }}>
                  <h4 className="spe-card-title" style={{ margin: 0 }}>Question {index + 1}</h4>
                  <div style={{ display: 'flex', gap: '0.125rem' }}>
                    <button type="button" className="spe-icon-btn" disabled={index === 0} onClick={() => move(index, -1)} aria-label={`Move question ${index + 1} up`}>↑</button>
                    <button type="button" className="spe-icon-btn" disabled={index === items.length - 1} onClick={() => move(index, 1)} aria-label={`Move question ${index + 1} down`}>↓</button>
                    <button type="button" className="spe-icon-btn spe-icon-btn-danger" onClick={() => remove(index)} aria-label={`Remove question ${index + 1}`}>✕</button>
                  </div>
                </div>
                <Field label="Question" hint={index === 0 ? 'Write it the way a customer would ask it. Asking the same question the category or the shop already answers replaces their answer with yours.' : undefined}>
                  {(p) => (
                    <Control
                      {...p}
                      value={item.question}
                      onChange={(e) => setItem(index, { question: e.target.value })}
                      placeholder="How long does delivery take?"
                    />
                  )}
                </Field>
                <Field label="Answer">
                  {(p) => (
                    <TextArea
                      {...p}
                      rows={3}
                      value={item.answer}
                      onChange={(e) => setItem(index, { answer: e.target.value })}
                      placeholder="Made to order, so allow three to four weeks."
                    />
                  )}
                </Field>
              </div>
            ))}
            <p className="spe-hint" style={{ margin: 0 }}>
              A question with no answer, or an answer with no question, is simply left off the page.
            </p>
          </div>
        )}
      </Section>

      <Section title="Shared questions" blurb="Questions written for this product's category, and for the whole shop, normally appear here too.">
        <Switch
          checked={inherit}
          onChange={(next) => patch((s) => ({ ...s, faqs: { ...s.faqs, inherit: next } }))}
          label="Also show the category's and the shop's questions"
          hint="Turn this off and the product shows only the questions written above - nothing else. Useful for the odd product where the usual answers are wrong."
        />
      </Section>
    </div>
  )
}
