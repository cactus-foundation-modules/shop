import { sanitizeRichText } from '@/lib/sanitize'
import {
  answerIsHtml,
  htmlAnswerToPlainText,
  plainAnswerToHtml,
  type ShpFaqItem,
  type ShpFaqRendered,
} from '@/modules/shop/lib/faq'

// Turning stored answers into the HTML a page prints. SERVER ONLY, and kept in a
// file of its own for exactly that reason: core's sanitiser reaches for jsdom to
// give DOMPurify a document, and a client component that could reach this import
// would drag jsdom into the browser bundle (scripts/check-client-graph.mjs is the
// thing that catches that, and it catches it at build time on a customer's
// install rather than here). Everything the two shapes of answer have in common
// lives in lib/faq.ts, which stays pure and runs anywhere.
//
// Both entry points to the FAQ markup are RSC - the product page's block builds
// its list in ShopProductDetail.rsc.tsx before handing it to a client component,
// and the category block renders in ShopCategoryFaqs.rsc.tsx - so sanitising on
// the way OUT, every time, rather than on the way in, is affordable and is the
// one that also covers a row somebody hand-edited in the database.

/**
 * Stored questions as rendered ones: the answer's HTML, sanitised, plus its
 * plain text for searching and for the structured data.
 *
 * An answer that is plain text is escaped and given its paragraphs; one that
 * carries markup goes through the same allow-list as the page builder's rich
 * text, so `onerror=`, `<script>` and a `javascript:` href never reach a page
 * however they got into the column.
 */
export function renderFaqItems(items: readonly ShpFaqItem[]): ShpFaqRendered[] {
  return items.map((item) => {
    if (!answerIsHtml(item.answer)) {
      // The plain text is already the plain text. Keeping it verbatim rather
      // than round-tripping it through the markup means an answer written
      // before any of this is quoted in the structured data exactly as it was.
      return { ...item, answerHtml: plainAnswerToHtml(item.answer) }
    }
    const answerHtml = sanitizeRichText(item.answer)
    return { question: item.question, answer: htmlAnswerToPlainText(answerHtml), answerHtml }
  })
}
