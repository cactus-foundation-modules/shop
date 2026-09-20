import { describe, it, expect } from 'vitest'
import { renderFaqItems } from '@/modules/shop/lib/faq-render'

// The one thing that must never regress here: an answer is markup an OWNER
// typed, but "an owner typed it" is not a safety argument - a compromised admin
// session, a pasted blob off a supplier's site, a hand-edited database row. It
// goes through the same allow-list as the page builder's rich text on the way
// out, every render.

const item = (answer: string) => renderFaqItems([{ question: 'Q?', answer }])[0]!

describe('renderFaqItems', () => {
  it('gives a plain answer its paragraphs, and leaves its text alone', () => {
    const out = item('Three days.\n\nIslands take longer.')
    expect(out.answerHtml).toBe('<p>Three days.</p><p>Islands take longer.</p>')
    // Kept verbatim, so an answer written before any of this is quoted in the
    // structured data exactly as it always was.
    expect(out.answer).toBe('Three days.\n\nIslands take longer.')
  })

  it('keeps the markup an owner meant', () => {
    const out = item('<p>See the <a href="/returns">returns policy</a>.</p><ul><li>Scotland</li></ul>')
    expect(out.answerHtml).toContain('<a href="/returns">returns policy</a>')
    expect(out.answerHtml).toContain('<li>Scotland</li>')
    expect(out.answer).toBe('See the returns policy. Scotland')
  })

  it('drops a script, an event handler and a javascript: href', () => {
    const out = item('<p>Hello</p><script>alert(1)</script><img src=x onerror="alert(1)">')
    expect(out.answerHtml).not.toContain('script')
    expect(out.answerHtml).not.toContain('onerror')
    expect(out.answerHtml).toContain('<p>Hello</p>')

    const link = item('<a href="javascript:alert(1)">tap</a>')
    expect(link.answerHtml).not.toContain('javascript:')
  })

  it('does not treat an answer TALKING about a tag as markup', () => {
    // No closing tag, so it is a sentence, and it must survive as one.
    expect(item('Use <strong> for emphasis.').answerHtml).toBe('<p>Use &lt;strong&gt; for emphasis.</p>')
  })
})
