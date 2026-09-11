'use client'

import { useId, useMemo, useRef, useState } from 'react'
import { AskProductQuestion } from '@/modules/shop/components/public/AskProductQuestion'
import { FaqAccordion } from '@/modules/shop/components/public/FaqAccordion'
import { matchFaqQuestions, type ShpFaqItem } from '@/modules/shop/lib/faq'

// The product page's FAQs section: a search box rather than a wall of questions.
//
// A catalogue product can inherit thirty questions from its range and the shop,
// and thirty collapsed headings is not an answer - it is a second page to read.
// So the shopper types what they came to ask, picks their question off the
// suggestions, and gets that one answer opened in front of them.
//
// WHAT A CRAWLER SEES, which is the whole reason this is shaped the way it is:
//
//  - Every question and answer is rendered into the server HTML, always. The
//    hiding is a `hidden` attribute, not a missing element and not a fetch - see
//    FaqAccordion. A scraper reading the HTML gets the lot.
//  - The FAQPage structured data FaqAccordion emits carries the full set too,
//    untouched by whatever the shopper has typed.
//  - Without JavaScript the search box cannot work, so the <noscript> rule below
//    hides the box and shows every question instead. A visitor with scripting
//    off gets the plain list this section used to be.
//
// State lives here and nowhere else: `open` questions are tracked by their own
// text, which resolveProductFaqs has already de-duplicated, so two levels of the
// FAQ chain can never collide on one key.

const SFS_CSS = `
.sfs{display:grid}
.sfs-box{position:relative}
.sfs-input{width:100%;padding:11px 14px;border-radius:10px;border:1px solid var(--color-border);background:var(--color-bg,var(--color-surface));color:var(--color-fg);font:inherit;font-size:15px}
.sfs-input:focus{outline:2px solid var(--color-primary);outline-offset:0;border-color:var(--color-primary)}
.sfs-pop{position:absolute;top:calc(100% + 6px);left:0;right:0;z-index:30;border:1px solid var(--color-border);border-radius:10px;background:var(--color-surface);box-shadow:0 10px 30px rgba(0,0,0,.12);overflow:hidden;max-height:340px;overflow-y:auto}
.sfs-ask{display:block;width:100%;text-align:left;border:none;border-bottom:1px solid var(--color-border);background:transparent;color:var(--color-primary);font:inherit;font-size:13px;font-weight:600;padding:11px 14px;cursor:pointer}
.sfs-ask:hover{background:var(--color-bg-subtle)}
.sfs-opt{display:block;width:100%;text-align:left;border:none;background:transparent;color:var(--color-fg);font:inherit;font-size:14px;padding:11px 14px;cursor:pointer}
.sfs-opt:hover,.sfs-opt[aria-selected="true"]{background:var(--color-bg-subtle)}
.sfs-none{margin:0;padding:11px 14px;font-size:13px;color:var(--color-text-muted)}
.sfs-hint{margin:10px 0 0;font-size:13px;color:var(--color-text-muted)}
`

// Shown only when scripting is off, where the box does nothing and the questions
// would otherwise be unreachable. !important because `hidden` is a UA rule and
// this has to outrank it.
const SFS_NOSCRIPT_CSS = `
.sfs-box{display:none!important}
.sfs-hint{display:none!important}
.spd-faq[hidden]{display:block!important}
`

export function ProductFaqSearch({ items, ask, placeholder }: {
  items: ShpFaqItem[]
  ask: { productId: string; buttonLabel: string; intro: string; thanks: string } | null
  placeholder: string
}) {
  const [query, setQuery] = useState('')
  const [focused, setFocused] = useState(false)
  const [active, setActive] = useState(-1)
  const [open, setOpen] = useState<string[]>([])
  const [askOpen, setAskOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const uid = useId()

  // Ranking lives in lib/faq.ts, where it can be exercised without a browser.
  const matches = useMemo(() => matchFaqQuestions(items, query), [items, query])

  // The popup is open while the box has focus and something has been typed. A
  // blur closes it on a timer rather than immediately, or the mousedown that
  // picks a suggestion would unmount the suggestion first.
  //
  // Typing also sets `focused`, and it has to: picking a suggestion closes the
  // popup by dropping that flag while the input KEEPS the browser's focus (the
  // mousedown was prevented, precisely so the list survives the click). No
  // second focus event is ever coming, so without that the box went dead for
  // every question after the first.
  const popOpen = focused && query.trim().length > 0
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  function choose(question: string) {
    setOpen((prev) => (prev.includes(question) ? prev : [...prev, question]))
    setQuery('')
    setActive(-1)
    setFocused(false)
  }

  function openAsk() {
    setAskOpen(true)
    setQuery('')
    setActive(-1)
    setFocused(false)
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!popOpen) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((i) => (matches.length === 0 ? -1 : (i + 1) % matches.length))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => (matches.length === 0 ? -1 : (i <= 0 ? matches.length : i) - 1))
    } else if (e.key === 'Enter') {
      const picked = matches[active] ?? matches[0]
      if (picked) {
        e.preventDefault()
        choose(picked.question)
      }
    } else if (e.key === 'Escape') {
      setFocused(false)
      setActive(-1)
    }
  }

  const listId = `${uid}-list`

  return (
    <div className="sfs">
      <style dangerouslySetInnerHTML={{ __html: SFS_CSS }} />
      <noscript><style dangerouslySetInnerHTML={{ __html: SFS_NOSCRIPT_CSS }} /></noscript>

      {items.length > 0 && (
        <>
          <div className="sfs-box">
            <input
              ref={inputRef}
              className="sfs-input"
              type="search"
              role="combobox"
              aria-expanded={popOpen}
              aria-controls={listId}
              aria-autocomplete="list"
              aria-label="Search the questions about this product"
              placeholder={placeholder}
              value={query}
              onChange={(e) => { setQuery(e.target.value); setActive(-1); setFocused(true) }}
              onFocus={() => { if (blurTimer.current) clearTimeout(blurTimer.current); setFocused(true) }}
              onBlur={() => { blurTimer.current = setTimeout(() => setFocused(false), 150) }}
              onKeyDown={onKeyDown}
            />
            {popOpen && (
              <div className="sfs-pop">
                {/* Above the suggestions on purpose: a shopper who has typed
                    their question and not found it is exactly the person with a
                    new one to ask, and they should not have to read to the
                    bottom of a list of near-misses first. */}
                {ask && (
                  <button type="button" className="sfs-ask" onMouseDown={(e) => e.preventDefault()} onClick={openAsk}>
                    Can&apos;t find your answer? Ask a new question
                  </button>
                )}
                <div id={listId} role="listbox" aria-label="Matching questions">
                  {matches.length === 0 ? (
                    <p className="sfs-none">Nothing matches that yet.</p>
                  ) : (
                    matches.map((item, i) => (
                      <button
                        key={item.question}
                        type="button"
                        role="option"
                        aria-selected={i === active}
                        className="sfs-opt"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => choose(item.question)}
                      >
                        {item.question}
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
          {open.length === 0 && (
            <p className="sfs-hint">
              {items.length === 1 ? 'One question answered here.' : `${items.length} questions answered here.`}
              {' '}Type a word or two to find yours.
            </p>
          )}
        </>
      )}

      {/* Always rendered, never filtered: this is the copy a crawler reads and
          the copy a visitor without JavaScript reads. Only what is SHOWN moves. */}
      {items.length > 0 && (
        <FaqAccordion
          items={items}
          wrapperClassName="spd-faqs"
          itemClassName="spd-faq"
          visibleQuestions={open}
          openQuestions={open}
          onToggleQuestion={(question, isOpen) => {
            // A shopper collapsing an answer themselves takes it off the list
            // rather than leaving React to reopen it on the next render.
            setOpen((prev) => (isOpen ? (prev.includes(question) ? prev : [...prev, question]) : prev.filter((q) => q !== question)))
          }}
        />
      )}

      {ask && (
        <AskProductQuestion
          productId={ask.productId}
          buttonLabel={ask.buttonLabel}
          intro={ask.intro}
          thanks={ask.thanks}
          open={askOpen}
          onOpenChange={setAskOpen}
        />
      )}
    </div>
  )
}
