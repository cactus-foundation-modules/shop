// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { ProductFaqSearch } from '@/modules/shop/components/public/ProductFaqSearch'

// The product page's FAQs section hides its questions behind a search box. The
// point of these tests is the thing that would otherwise regress in silence:
// hiding them from the SHOPPER must never hide them from a crawler. Nobody
// notices that in review, and nobody notices it on the page either - it shows up
// weeks later as questions that stopped being quoted in search results.

const ITEMS = [
  { question: 'How long does delivery take?', answer: 'Three working days to the mainland.' },
  { question: 'Does it come assembled?', answer: 'Arms and castors go on at your end.' },
  { question: 'Can I have it in another fabric?', answer: 'Anything off the Spice card.' },
]

const ASK = { productId: 'prod-1', buttonLabel: 'Ask a question', intro: 'Ask us anything.', thanks: 'Thank you.' }

function html(ask: typeof ASK | null = ASK) {
  return renderToStaticMarkup(
    <ProductFaqSearch items={ITEMS} ask={ask} placeholder="Search our answers" />,
  )
}

describe('what a crawler reads', () => {
  it('puts every question AND every answer in the server HTML', () => {
    const markup = html()
    for (const item of ITEMS) {
      expect(markup).toContain(item.question)
      expect(markup).toContain(item.answer)
    }
  })

  it('carries the full FAQPage structured data whatever the shopper has typed', () => {
    const markup = html()
    expect(markup).toContain('application/ld+json')
    expect(markup).toContain('FAQPage')
    // Three questions written, three questions published. A search box that
    // narrowed this would be telling Google the product answers one question.
    expect(markup.match(/"@type":"Question"/g)).toHaveLength(ITEMS.length)
  })

  it('hides the questions with an attribute, not by leaving them out', () => {
    const markup = html()
    // Present in the markup and hidden in the browser - which is exactly the
    // arrangement that lets the box hide without withholding.
    expect(markup.match(/<details[^>]*hidden/g)).toHaveLength(ITEMS.length)
  })

  it('unhides everything for a visitor with no JavaScript', () => {
    const markup = html()
    expect(markup).toContain('<noscript>')
    expect(markup).toContain('.spd-faq[hidden]{display:block!important}')
    expect(markup).toContain('.sfs-box{display:none!important}')
  })
})

describe('what a shopper gets', () => {
  async function mount(ask: typeof ASK | null = ASK) {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    await act(async () => {
      root.render(<ProductFaqSearch items={ITEMS} ask={ask} placeholder="Search our answers" />)
    })
    const input = host.querySelector('input.sfs-input') as HTMLInputElement
    const type = async (value: string) => {
      await act(async () => {
        input.focus()
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set
        setter?.call(input, value)
        input.dispatchEvent(new Event('input', { bubbles: true }))
      })
    }
    const click = async (el: Element) => {
      await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
    }
    return { host, input, type, click }
  }

  it('opens on no questions showing at all', async () => {
    const { host } = await mount()
    const shown = [...host.querySelectorAll('details')].filter((d) => !d.hasAttribute('hidden'))
    expect(shown).toHaveLength(0)
  })

  it('suggests the questions that match what was typed', async () => {
    const { host, type } = await mount()
    await type('deliv')
    const options = [...host.querySelectorAll('[role="option"]')].map((o) => o.textContent)
    expect(options).toEqual(['How long does delivery take?'])
  })

  it('suggests on the answer as well as the question', async () => {
    const { host, type } = await mount()
    // "castors" appears in an answer and in no question at all.
    await type('castors')
    const options = [...host.querySelectorAll('[role="option"]')].map((o) => o.textContent)
    expect(options).toEqual(['Does it come assembled?'])
  })

  it('shows and opens the question that was picked, and only that one', async () => {
    const { host, type, click } = await mount()
    await type('fabric')
    const option = host.querySelector('[role="option"]')!
    await click(option)

    const details = [...host.querySelectorAll('details')]
    const shown = details.filter((d) => !d.hasAttribute('hidden'))
    expect(shown).toHaveLength(1)
    expect(shown[0]!.textContent).toContain('Anything off the Spice card.')
    expect(shown[0]!.hasAttribute('open')).toBe(true)
    // The rest stay in the page, still hidden, still readable by a crawler.
    expect(details).toHaveLength(ITEMS.length)
  })

  it('offers to take a new question above the suggestions, and opens the form on it', async () => {
    const { host, type, click } = await mount()
    await type('warranty')
    const pop = host.querySelector('.sfs-pop')!
    const ask = pop.querySelector('.sfs-ask')!
    expect(ask.textContent).toContain('Ask a new question')
    // Above the near-misses, not below them: the shopper who found nothing is
    // the one with a question to ask.
    expect(pop.firstElementChild).toBe(ask)

    expect(host.querySelector('.spq-form')).toBeNull()
    await click(ask)
    // Straight to the form - not to the button that opens the form.
    expect(host.querySelector('.spq-form')).not.toBeNull()
  })

  it('leaves the ask link out entirely on a shop that does not take questions', async () => {
    const { host, type } = await mount(null)
    await type('delivery')
    expect(host.querySelector('.sfs-ask')).toBeNull()
    expect(host.querySelector('[role="option"]')).not.toBeNull()
  })

  it('says so plainly when nothing matches, rather than showing an empty list', async () => {
    const { host, type } = await mount()
    await type('zzzz')
    expect(host.querySelectorAll('[role="option"]')).toHaveLength(0)
    expect(host.querySelector('.sfs-none')?.textContent).toContain('Nothing matches')
  })
})
