import { buildProductFaqJsonLd, faqJsonLdScript, type ShpFaqItem } from '@/modules/shop/lib/faq'

// One question-and-answer list, and the FAQPage structured data that goes with
// it. Plain <details>, so it costs no client JavaScript and a jump-link lands on
// a section that is already usable.
//
// The markup deliberately matches ultimate-seo's FAQ (SEO) block rather than
// importing it: shop cannot reach into another module's code, and a page that
// carries both an SEO FAQ block and one of shop's own should not look like two
// different websites.
//
// The class names are the CALLER's, not this file's, because the two surfaces
// that draw a list live under different stylesheets: the product page's sections
// are dressed inside .spd-tabs (see tabsCss in detail-parts.tsx), and the
// category-page block brings its own. Only the markup and the JSON-LD are shared
// - which is the part that must never drift, since a search engine reading two
// different shapes off one site is nobody's idea of a feature.

export function FaqAccordion({ items, wrapperClassName, itemClassName }: {
  items: ShpFaqItem[]
  wrapperClassName: string
  itemClassName: string
}) {
  const jsonLd = buildProductFaqJsonLd(items)
  return (
    <div className={wrapperClassName}>
      {items.map((item) => (
        // Questions are de-duplicated before they get here (resolveProductFaqs),
        // so no two carry the same text and the key is stable across a re-render.
        <details key={item.question} className={itemClassName}>
          <summary>{item.question}</summary>
          <p>{item.answer}</p>
        </details>
      ))}
      {jsonLd && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: faqJsonLdScript(jsonLd) }} />}
    </div>
  )
}
