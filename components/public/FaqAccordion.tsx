import { buildProductFaqJsonLd, faqJsonLdScript, type ShpFaqRendered } from '@/modules/shop/lib/faq'

// One question-and-answer list, and the FAQPage structured data that goes with
// it. Plain <details>, so it costs no client JavaScript and a jump-link lands on
// a section that is already usable.
//
// The markup deliberately matches ultimate-seo's FAQ (SEO) block rather than
// importing it: shop cannot reach into another module's code, and a page that
// carries both an SEO FAQ block and one of shop's own should not look like two
// different websites.
//
// The class names are the CALLER's, not this file's (bar the answer's - see
// below), because the two surfaces
// that draw a list live under different stylesheets: the product page's sections
// are dressed inside .spd-tabs (see tabsCss in detail-parts.tsx), and the
// category-page block brings its own. Only the markup and the JSON-LD are shared
// - which is the part that must never drift, since a search engine reading two
// different shapes off one site is nobody's idea of a feature.
//
// EVERY question is always rendered, whatever the state props say. `hidden` is a
// display decision taken in the browser; the text stays in the HTML either way,
// which is what a crawler that does not run JavaScript reads, and it is why the
// product page can hide the lot behind a search box without hiding anything from
// a search engine. The structured data below carries the same full set.

export function FaqAccordion({
  items, wrapperClassName, itemClassName, visibleQuestions, openQuestions, onToggleQuestion,
}: {
  items: ShpFaqRendered[]
  wrapperClassName: string
  itemClassName: string
  /** Questions to SHOW. Undefined - the ordinary case, and every server-rendered
   *  list - shows the lot. An array shows only what it names and renders the
   *  rest with `hidden`. */
  visibleQuestions?: readonly string[]
  /** Questions whose answer is open. Undefined leaves every one closed, which is
   *  what a plain <details> does anyway. */
  openQuestions?: readonly string[]
  /** Told when a shopper opens or closes one themselves, so a caller holding
   *  `openQuestions` in state does not fight the browser over it. */
  onToggleQuestion?: (question: string, open: boolean) => void
}) {
  const jsonLd = buildProductFaqJsonLd(items)
  const shown = visibleQuestions ? new Set(visibleQuestions) : null
  const opened = openQuestions ? new Set(openQuestions) : null
  return (
    <div className={wrapperClassName}>
      {items.map((item) => (
        // Questions are de-duplicated before they get here (resolveProductFaqs),
        // so no two carry the same text and the key is stable across a re-render.
        <details
          key={item.question}
          className={itemClassName}
          hidden={shown ? !shown.has(item.question) : undefined}
          open={opened ? opened.has(item.question) : undefined}
          onToggle={onToggleQuestion ? (e) => onToggleQuestion(item.question, e.currentTarget.open) : undefined}
        >
          <summary>{item.question}</summary>
          {/* The answer's own markup, already sanitised by renderFaqItems - see
              lib/faq-render.ts, and note the TYPE: only that function makes a
              ShpFaqRendered, so a caller cannot hand this component a raw
              stored answer and have it printed as HTML.

              A div rather than the <p> this used to be, because an answer that
              carries its own paragraphs cannot be nested inside one. Its class
              is fixed here rather than passed in like the two around it: this is
              the one element BOTH stylesheets have to dress identically, and a
              caller free to name it is a caller free to forget. */}
          <div className="faq-a" dangerouslySetInnerHTML={{ __html: item.answerHtml }} />
        </details>
      ))}
      {jsonLd && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: faqJsonLdScript(jsonLd) }} />}
    </div>
  )
}
