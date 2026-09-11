import { describe, it, expect } from 'vitest'
import {
  EMPTY_FAQ_SET,
  buildProductFaqJsonLd,
  faqJsonLdScript,
  normaliseFaqItems,
  normaliseFaqSet,
  resolveCategoryFaqs,
  resolveProductFaqs,
  type ShpFaqItem,
} from '@/modules/shop/lib/faq'

const set = (items: ShpFaqItem[], inherit = true) => ({ items, inherit })
const q = (question: string, answer = 'an answer') => ({ question, answer })

describe('normaliseFaqSet', () => {
  it('reads a missing column as an empty, inheriting set', () => {
    expect(normaliseFaqSet(null)).toEqual(EMPTY_FAQ_SET)
    expect(normaliseFaqSet(undefined)).toEqual(EMPTY_FAQ_SET)
  })

  it('reads rubbish as empty rather than throwing', () => {
    // A hand-edited row, or one written by an older editor. A product page must
    // survive it - see the note on FaqSetSchema.
    expect(normaliseFaqSet('not an object')).toEqual(EMPTY_FAQ_SET)
    expect(normaliseFaqSet({ items: [{ question: 1 }] })).toEqual(EMPTY_FAQ_SET)
  })

  it('trims, and drops half-written rows', () => {
    const parsed = normaliseFaqSet({
      items: [
        { question: '  Delivery?  ', answer: '  Three days.  ' },
        { question: 'No answer', answer: '   ' },
        { question: '', answer: 'No question' },
      ],
      inherit: false,
    })
    expect(parsed).toEqual({ items: [{ question: 'Delivery?', answer: 'Three days.' }], inherit: false })
  })

  it('defaults inherit to true when the stored set does not say', () => {
    expect(normaliseFaqSet({ items: [] }).inherit).toBe(true)
  })
})

describe('normaliseFaqItems', () => {
  it('reads the shop-wide list, dropping blanks', () => {
    expect(normaliseFaqItems([{ question: 'A?', answer: 'B' }, { question: 'C?', answer: '' }]))
      .toEqual([{ question: 'A?', answer: 'B' }])
  })

  it('reads anything unparseable as no questions', () => {
    expect(normaliseFaqItems(undefined)).toEqual([])
    expect(normaliseFaqItems({ nope: true })).toEqual([])
  })
})

describe('resolveProductFaqs', () => {
  it('prints product, then category, then shop-wide', () => {
    const out = resolveProductFaqs({
      product: set([q('Product?')]),
      categories: [set([q('Category?')]), set([q('Parent?')])],
      shopWide: [q('Shop?')],
    })
    expect(out.map((i) => i.question)).toEqual(['Product?', 'Category?', 'Parent?', 'Shop?'])
  })

  it('lets a nearer level overrule the same question', () => {
    const out = resolveProductFaqs({
      product: set([q('Delivery?', 'Made to order - four weeks.')]),
      categories: [],
      shopWide: [q('Delivery?', 'Three working days.')],
    })
    expect(out).toEqual([{ question: 'Delivery?', answer: 'Made to order - four weeks.' }])
  })

  it('matches the same question through case, spacing and the question mark', () => {
    const out = resolveProductFaqs({
      product: set([q('How  Long Does DELIVERY take')]),
      categories: [],
      shopWide: [q('How long does delivery take?', 'Three days.')],
    })
    expect(out).toHaveLength(1)
    expect(out[0]?.answer).toBe('an answer')
  })

  it('stops dead at a product that inherits nothing', () => {
    const out = resolveProductFaqs({
      product: set([q('Only this?')], false),
      categories: [set([q('Category?')])],
      shopWide: [q('Shop?')],
    })
    expect(out.map((i) => i.question)).toEqual(['Only this?'])
  })

  it('stops at a category that inherits nothing, keeping that category own questions', () => {
    const out = resolveProductFaqs({
      product: set([]),
      categories: [set([q('Range?')], false), set([q('Parent?')])],
      shopWide: [q('Shop?')],
    })
    expect(out.map((i) => i.question)).toEqual(['Range?'])
  })

  it('gives a product with nothing anywhere an empty list, so no section renders', () => {
    expect(resolveProductFaqs({ product: EMPTY_FAQ_SET, categories: [], shopWide: [] })).toEqual([])
  })

  it('lets a product show nothing at all while its category has questions', () => {
    // The empty-but-not-inheriting set: kept in the database precisely so this
    // can be said. See updateProduct.
    const out = resolveProductFaqs({
      product: set([], false),
      categories: [set([q('Category?')])],
      shopWide: [q('Shop?')],
    })
    expect(out).toEqual([])
  })
})

describe('resolveCategoryFaqs', () => {
  it('walks the category chain and then the shop, with no product in the way', () => {
    const out = resolveCategoryFaqs([set([q('Range?')]), set([q('Parent?')])], [q('Shop?')])
    expect(out.map((i) => i.question)).toEqual(['Range?', 'Parent?', 'Shop?'])
  })

  it('obeys a category that inherits nothing, exactly as a product page would', () => {
    const out = resolveCategoryFaqs([set([q('Range?')], false), set([q('Parent?')])], [q('Shop?')])
    expect(out.map((i) => i.question)).toEqual(['Range?'])
  })
})

describe('buildProductFaqJsonLd', () => {
  it('emits nothing for no questions, so no empty script lands on the page', () => {
    expect(buildProductFaqJsonLd([])).toBeNull()
  })

  it('emits one Question per item', () => {
    const json = buildProductFaqJsonLd([q('Delivery?', 'Three days.')]) as {
      '@type': string
      mainEntity: Array<{ name: string; acceptedAnswer: { text: string } }>
    }
    expect(json['@type']).toBe('FAQPage')
    expect(json.mainEntity).toEqual([
      { '@type': 'Question', name: 'Delivery?', acceptedAnswer: { '@type': 'Answer', text: 'Three days.' } },
    ])
  })

  it('escapes < so an answer cannot close the script element early', () => {
    const json = buildProductFaqJsonLd([q('Markup?', 'Use <strong> for emphasis.')])
    expect(json).not.toBeNull()
    const serialised = faqJsonLdScript(json as object)
    expect(serialised).not.toContain('<')
    expect(serialised).toContain('\\u003cstrong')
  })
})
