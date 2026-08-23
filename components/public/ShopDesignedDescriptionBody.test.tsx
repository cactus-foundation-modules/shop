import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { ShopDesignedDescriptionBody } from '@/modules/shop/components/public/ShopDesignedDescriptionBody'

// Only the plain-text branch is exercised here: the designed branch pulls in the
// RSC Puck config, which drags half of next/headers behind it.
const render = async (description: string) => {
  const el = await ShopDesignedDescriptionBody({
    subject: { description, descriptionPuck: null },
    layoutType: 'shop-category-description',
  })
  return renderToStaticMarkup(el as React.ReactElement)
}

describe('plain-text description', () => {
  // The description box takes plain text, and the paragraphs typed into it are
  // as often separated by one Return as by two. Splitting on blank lines alone
  // swept a whole visible paragraph into the lead, and the Read more turned up
  // at the end of the second one.
  it('treats a single line break as the end of a paragraph', async () => {
    const html = await render('First paragraph.\nSecond paragraph.')
    expect(html).toMatch(/First paragraph\.<button/)
    expect(html).toMatch(/class="shop-cat-desc-fold"[\s\S]*Second paragraph\./)
  })

  it('treats a blank line the same way', async () => {
    const html = await render('First paragraph.\n\nSecond paragraph.')
    expect(html).toMatch(/First paragraph\.<button/)
  })

  it('leads with the first paragraph and folds the rest', async () => {
    const html = await render('One.\nTwo.\nThree.')
    const fold = html.indexOf('class="shop-cat-desc-fold"')
    expect(html.indexOf('One.')).toBeLessThan(fold)
    expect(html.indexOf('Two.')).toBeGreaterThan(fold)
    expect(html.indexOf('Three.')).toBeGreaterThan(fold)
  })

  it('offers no Read more on a description of one paragraph', async () => {
    const html = await render('The only thing there is to say about it.')
    expect(html).toContain('The only thing there is to say about it.')
    expect(html).not.toContain('Read more')
  })

  it('prints nothing at all when there is no description', async () => {
    const el = await ShopDesignedDescriptionBody({
      subject: { description: '', descriptionPuck: null },
      layoutType: 'shop-category-description',
    })
    expect(el).toBeNull()
  })
})
