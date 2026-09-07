'use client'

import { useEffect, useRef, useState } from 'react'

// "Questions about your delivery" - the courier's own small print, answered by
// the shop, on the page the customer is already looking at.
//
// A modal rather than a page because it is an aside: somebody checking a
// delivery time should not be navigated away from their order to find out
// whether the driver rings first. It opens by itself when the customer arrives
// from the link in their delivery email, which is the whole reason that link
// carries ?faq=1.
//
// Answers are plain TEXT, printed as text. Not HTML, not markdown, nothing
// rendered - these are typed into a settings box by whoever runs the shop, and
// a settings box that renders markup is a stored-XSS hole with a friendly name.
// Line breaks survive; tags do not.
//
// The <noscript> copy is not decoration. The link in the email lands here, and
// a delivery email that opens an empty page for somebody with scripts off is a
// worse failure than not offering the link at all.

export type CourierFaq = { id: string; question: string; answer: string }

export function CourierFaqModal({ faqs, courierName, openInitially }: {
  faqs: CourierFaq[]
  /** Named in the heading where the shop has told us who is delivering. */
  courierName: string | null
  /** True when the customer followed the link in their delivery email. */
  openInitially: boolean
}) {
  const [open, setOpen] = useState(openInitially)
  const closeRef = useRef<HTMLButtonElement>(null)

  // Escape closes it, and the close button takes focus when it opens, so a
  // keyboard is not left behind the overlay hunting for a way out.
  useEffect(() => {
    if (!open) return
    closeRef.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  if (faqs.length === 0) return null

  const heading = courierName ? `Delivery questions - ${courierName}` : 'Delivery questions'

  return (
    <>
      <button type="button" className="sod-btn sod-btn-ghost sod-faq-open" onClick={() => setOpen(true)}>
        Questions about your delivery
      </button>

      <noscript>
        <div className="sod-faq-plain" id="delivery-questions">
          <h3>{heading}</h3>
          {faqs.map((faq) => (
            <details key={faq.id}>
              <summary>{faq.question}</summary>
              <p className="sod-faq-answer">{faq.answer}</p>
            </details>
          ))}
        </div>
      </noscript>

      {open && (
        <div
          className="sod-faq-overlay"
          role="dialog"
          aria-modal="true"
          aria-label={heading}
          onClick={(event) => event.target === event.currentTarget && setOpen(false)}
        >
          <div className="sod-faq-panel">
            <div className="sod-faq-head">
              <h3>{heading}</h3>
              <button type="button" ref={closeRef} aria-label="Close" onClick={() => setOpen(false)}>
                ×
              </button>
            </div>
            <div className="sod-faq-body">
              {faqs.map((faq) => (
                <div key={faq.id} className="sod-faq-item">
                  <h4>{faq.question}</h4>
                  <p className="sod-faq-answer">{faq.answer}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
