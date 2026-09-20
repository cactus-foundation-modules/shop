import { describe, it, expect } from 'vitest'
import {
  EMPTY_FAQ_SET,
  answerIsHtml,
  buildProductFaqJsonLd,
  htmlAnswerToPlainText,
  plainAnswerToHtml,
  faqJsonLdScript,
  matchFaqQuestions,
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

describe('matchFaqQuestions', () => {
  const items = [
    q('Delivery to Scotland?', 'Three days, mainland only.'),
    q('How long does delivery take?', 'Three working days.'),
    q('Is it assembled?', 'Castors go on at your end.'),
  ]

  it('matches nothing at all on an empty search', () => {
    // The box exists to narrow thirty questions to one. Opening it on all
    // thirty would be the wall of headings this replaced.
    expect(matchFaqQuestions(items, '')).toEqual([])
    expect(matchFaqQuestions(items, '   ')).toEqual([])
  })

  it('puts a question that STARTS with what was typed above one that merely contains it', () => {
    const out = matchFaqQuestions(items, 'delivery')
    expect(out.map((i) => i.question)).toEqual(['Delivery to Scotland?', 'How long does delivery take?'])
  })

  it('finds a question by its answer when the question itself says nothing', () => {
    expect(matchFaqQuestions(items, 'castors').map((i) => i.question)).toEqual(['Is it assembled?'])
  })

  it('ranks a question-text match above an answer-only one', () => {
    const out = matchFaqQuestions([q('Assembly?', 'No tools needed.'), q('Tools?', 'None.')], 'tools')
    expect(out.map((i) => i.question)).toEqual(['Tools?', 'Assembly?'])
  })

  it('ignores case, and caps the list so a shortlist stays short', () => {
    expect(matchFaqQuestions(items, 'DELIVERY')).toHaveLength(2)
    const many = Array.from({ length: 20 }, (_, i) => q(`Delivery question ${i}?`))
    expect(matchFaqQuestions(many, 'delivery')).toHaveLength(8)
    expect(matchFaqQuestions(many, 'delivery', 3)).toHaveLength(3)
  })

  it('breaks a tie on the order the levels resolved in, so the nearest answer leads', () => {
    // resolveProductFaqs hands over product questions first, then the
    // category's, then the shop's. An equally good match must not reshuffle that.
    const out = matchFaqQuestions([q('Delivery?', 'This product.'), q('Delivery?x', 'The shop.')], 'delivery')
    expect(out[0]!.answer).toBe('This product.')
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

describe('answerIsHtml', () => {
  it('reads plain writing as plain writing, angle brackets and all', () => {
    expect(answerIsHtml('Three working days.')).toBe(false)
    expect(answerIsHtml('Allow 3 < 5 weeks.')).toBe(false)
    // Somebody TALKING about markup rather than writing it. Treating this as
    // HTML would swallow the very thing they were trying to show.
    expect(answerIsHtml('Use <strong> for emphasis.')).toBe(false)
  })

  it('reads a real fragment as HTML', () => {
    expect(answerIsHtml('<p>Three working days.</p>')).toBe(true)
    expect(answerIsHtml('Mainland only.<br>Islands take longer.')).toBe(true)
    expect(answerIsHtml('<ul><li>Scotland</li></ul>')).toBe(true)
    expect(answerIsHtml('See the <a href="/returns">returns policy</a>.')).toBe(true)
    expect(answerIsHtml('<img src="/a.png" alt="" />')).toBe(true)
  })
})

describe('plainAnswerToHtml', () => {
  it('gives a paragraph per block and a break per single newline', () => {
    expect(plainAnswerToHtml('One.\n\nTwo.')).toBe('<p>One.</p><p>Two.</p>')
    expect(plainAnswerToHtml('One.\nStill one.')).toBe('<p>One.<br />Still one.</p>')
  })

  it('escapes what the writer typed, so plain text can never become markup', () => {
    expect(plainAnswerToHtml('Use <strong> & "quotes"')).toBe(
      '<p>Use &lt;strong&gt; &amp; &quot;quotes&quot;</p>',
    )
  })

  it('prints nothing at all for nothing at all', () => {
    expect(plainAnswerToHtml('   \n\n  ')).toBe('')
  })
})

describe('htmlAnswerToPlainText', () => {
  it('reads the words out of a fragment, one space between blocks', () => {
    expect(htmlAnswerToPlainText('<p>Mainland only.</p><p>Islands take longer.</p>'))
      .toBe('Mainland only. Islands take longer.')
    expect(htmlAnswerToPlainText('<ul><li>Scotland</li><li>Wales</li></ul>')).toBe('Scotland Wales')
    expect(htmlAnswerToPlainText('Mainland.<br>Islands.')).toBe('Mainland. Islands.')
  })

  it('decodes the entities a writer would actually meet', () => {
    expect(htmlAnswerToPlainText('<p>Marks &amp; Spencer&#39;s &quot;best&quot;</p>'))
      .toBe('Marks & Spencer\'s "best"')
  })
})

describe('matchFaqQuestions over an answer that carries markup', () => {
  it('matches the words, not the tags', () => {
    // The plain text is what the search box is handed (see ShpFaqRendered), so
    // a shopper typing a word finds it, and one typing "li" does not find every
    // list in the shop.
    const items = [{ question: 'Where to?', answer: htmlAnswerToPlainText('<ul><li>Scotland</li></ul>') }]
    expect(matchFaqQuestions(items, 'scotland')).toHaveLength(1)
    expect(matchFaqQuestions(items, '<li>')).toHaveLength(0)
  })
})
