// Product FAQs: the questions a shopper keeps asking about a product, shown as
// a section of its own on the product page.
//
// Three places can hold them, and a product page shows all three at once:
//
//   1. the product itself      (shp_products.faqs)
//   2. the category it is filed under, and that category's ancestors
//                              (shp_categories.faqs)
//   3. the shop                (Shop settings > General > Product FAQs)
//
// Nearest wins. A product asked the same question as the shop-wide list answers
// it in its own words and the shop-wide one is dropped, so an owner can write
// one set of answers for the whole catalogue and still overrule it on the one
// product where it is wrong.
//
// Every level can also refuse to inherit - "these are the only questions this
// product asks" - which stops the walk dead rather than merging.
//
// Nothing here talks to the database or to React: it is the shape, the parse and
// the merge, so it can be exercised on its own and so the product page, the
// product editor and the settings screen all agree about what a FAQ set is.

import { z } from 'zod'

/** One question and its answer. Both are plain text; the answer renders as a
 *  paragraph, exactly as the FAQ (SEO) block's does. */
export type ShpFaqItem = { question: string; answer: string }

/** What one level holds: its own questions, and whether the levels above it
 *  still get a say. */
export type ShpFaqSet = { items: ShpFaqItem[]; inherit: boolean }

const FaqItemSchema = z.object({
  question: z.string(),
  answer: z.string(),
})

// How a STORED set is read, and read forgivingly on purpose: a set saved by an
// older version of the editor, or hand-edited in the database, must not take a
// product page down. It reads as "no questions", which is what every product had
// before this existed.
const FaqSetSchema = z.object({
  items: z.array(FaqItemSchema).default([]),
  inherit: z.boolean().default(true),
})

// What an API body may send. Deliberately NOT the schema the stored column is
// read through: this one has limits on it, and a set already in the database
// that somehow exceeds them must still READ (as itself) rather than vanish.
// The caps are generous enough that nobody writing genuine FAQs will meet one,
// and mean a request body cannot put an unbounded blob in a jsonb column.
//
// Exported because they are not only this schema's business any more: a question
// asked on the product page can be published straight into a FAQ set
// (lib/db/product-questions.ts), and a set holding a question longer than this
// would read back fine and then refuse to SAVE the next time somebody opened the
// product editor - which is a product nobody can edit, from a cap two files
// apart disagreeing.
export const FAQ_QUESTION_MAX = 300
export const FAQ_ANSWER_MAX = 4000

const FaqItemBodySchema = z.object({
  question: z.string().max(FAQ_QUESTION_MAX),
  answer: z.string().max(FAQ_ANSWER_MAX),
})

export const FaqSetBodySchema = z
  .object({
    items: z.array(FaqItemBodySchema).max(100).default([]),
    inherit: z.boolean().default(true),
  })
  .transform((set): ShpFaqSet => ({ items: cleanItems(set.items), inherit: set.inherit }))

/** A level that holds nothing and blocks nothing. */
export const EMPTY_FAQ_SET: ShpFaqSet = { items: [], inherit: true }

/** Parse a stored jsonb blob (or an API body) into a set. Anything unreadable
 *  reads as empty rather than throwing - see the note on FaqSetSchema. */
export function normaliseFaqSet(value: unknown): ShpFaqSet {
  if (value == null) return EMPTY_FAQ_SET
  const parsed = FaqSetSchema.safeParse(value)
  if (!parsed.success) return EMPTY_FAQ_SET
  return { items: cleanItems(parsed.data.items), inherit: parsed.data.inherit }
}

/** Parse a bare list of questions - the shop-wide set, which has no inherit flag
 *  of its own because there is nothing above it. */
export function normaliseFaqItems(value: unknown): ShpFaqItem[] {
  const parsed = z.array(FaqItemSchema).safeParse(value)
  return parsed.success ? cleanItems(parsed.data) : []
}

/** Trim, and drop any half-written row. An unanswered question is not a FAQ, and
 *  a blank one would render as an empty accordion the shopper can open onto
 *  nothing. */
function cleanItems(items: ShpFaqItem[]): ShpFaqItem[] {
  const cleaned: ShpFaqItem[] = []
  for (const item of items) {
    const question = item.question.trim()
    const answer = item.answer.trim()
    if (!question || !answer) continue
    cleaned.push({ question, answer })
  }
  return cleaned
}

/** What two questions have to match on to count as the same one, so a product
 *  can overrule a shop-wide answer by asking the question again. Deliberately
 *  loose about case, spacing and the question mark: nobody retypes a heading
 *  character-for-character, and a near-miss would print both answers. */
function questionKey(question: string): string {
  return question
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[?？]+$/, '')
    .trim()
}

/** Every level's set, nearest first. `categories` runs from the product's own
 *  category outwards to the root. */
export type FaqLevels = {
  product: ShpFaqSet
  categories: ShpFaqSet[]
  shopWide: ShpFaqItem[]
}

/**
 * The finished list for one product, in print order: its own questions, then its
 * category's, then its category's parent's, and finally the shop-wide ones.
 *
 * Two things stop the walk: a level that says it does not inherit (nothing above
 * it is read at all), and a question already asked nearer the product (the
 * nearer answer stands and the further one is dropped).
 */
export function resolveProductFaqs({ product, categories, shopWide }: FaqLevels): ShpFaqItem[] {
  const out: ShpFaqItem[] = []
  const seen = new Set<string>()

  const add = (items: ShpFaqItem[]) => {
    for (const item of items) {
      const key = questionKey(item.question)
      if (seen.has(key)) continue
      seen.add(key)
      out.push(item)
    }
  }

  add(product.items)
  if (!product.inherit) return out

  for (const category of categories) {
    add(category.items)
    // This category answers for itself. Its parents, and the shop-wide list, are
    // not consulted - which is how a range with its own set of questions keeps
    // the generic delivery ones off its products.
    if (!category.inherit) return out
  }

  add(shopWide)
  return out
}

/**
 * The finished list for a CATEGORY page's own FAQs block: the category's
 * questions, then its parents', then the shop-wide ones, with the same
 * nearest-wins and stop-at-a-level-that-does-not-inherit rules.
 *
 * The same walk as a product's, minus the product - which is exactly what it
 * delegates to, so the category page and the products beneath it can never
 * disagree about which answer wins.
 */
export function resolveCategoryFaqs(categories: ShpFaqSet[], shopWide: ShpFaqItem[]): ShpFaqItem[] {
  return resolveProductFaqs({ product: EMPTY_FAQ_SET, categories, shopWide })
}

// How many suggestions the product page's search box offers at once. Enough to
// cover the near-misses, few enough that the list is still a shortlist.
export const FAQ_SUGGESTION_LIMIT = 8

/**
 * The questions a shopper's search matches, best first.
 *
 * Answers are searched as well as questions, because somebody typing "delivery"
 * should find "How long until it arrives?" when the answer is about delivery -
 * but a question-text match always outranks an answer-only one, and a question
 * that STARTS with what was typed outranks one that merely contains it.
 *
 * An empty search matches nothing rather than everything. The box exists to
 * narrow thirty questions down to one; opening it on all thirty would be the
 * wall of headings this replaced.
 */
export function matchFaqQuestions(
  items: readonly ShpFaqItem[],
  query: string,
  limit = FAQ_SUGGESTION_LIMIT,
): ShpFaqItem[] {
  const needle = query.trim().toLowerCase()
  if (!needle) return []
  const scored: Array<{ item: ShpFaqItem; score: number; index: number }> = []
  items.forEach((item, index) => {
    const question = item.question.toLowerCase()
    const answer = item.answer.toLowerCase()
    let score = -1
    if (question.startsWith(needle)) score = 0
    else if (question.includes(needle)) score = 1
    else if (answer.includes(needle)) score = 2
    if (score >= 0) scored.push({ item, score, index })
  })
  // Ties keep the order the levels resolved in - the product's own questions
  // first, then its category's, then the shop's - so the nearest answer to an
  // equally good match is the one offered first.
  scored.sort((a, b) => a.score - b.score || a.index - b.index)
  return scored.slice(0, limit).map((s) => s.item)
}

/**
 * FAQPage structured data for the questions actually on the page.
 *
 * Same shape the FAQ (SEO) block emits, and deliberately a copy rather than an
 * import: shop must not reach into another module's code (a shop without
 * ultimate-seo installed would not build), and a search engine reading two
 * different shapes from the same site would be nobody's idea of a feature.
 */
export function buildProductFaqJsonLd(items: ShpFaqItem[]): object | null {
  if (items.length === 0) return null
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: { '@type': 'Answer', text: item.answer },
    })),
  }
}

/** Serialise for a <script> tag: `<` escaped so an answer carrying markup cannot
 *  close the element early and spill the rest of the JSON into the page as
 *  broken JavaScript. Same treatment the product's own Product JSON-LD gets. */
export function faqJsonLdScript(data: object): string {
  return JSON.stringify(data).replace(/</g, '\\u003c')
}
