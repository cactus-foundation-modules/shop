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
  it('folds every paragraph away - the blurb above is what stays on the page', async () => {
    const html = await render('First paragraph.\n\nSecond paragraph.')
    const fold = html.indexOf('class="shop-cat-desc-fold"')
    expect(fold).toBeGreaterThan(-1)
    expect(html.indexOf('First paragraph.')).toBeGreaterThan(fold)
    expect(html.indexOf('Second paragraph.')).toBeGreaterThan(fold)
  })

  it('splits on blank lines and leaves a single line break to pre-line', async () => {
    const html = await render('One.\nStill one.\n\nTwo.')
    expect(html).toContain('white-space:pre-line')
    expect(html).toContain('One.\nStill one.')
    expect(html).toContain('>Two.<')
  })

  it('prints nothing at all when there is no description', async () => {
    const el = await ShopDesignedDescriptionBody({
      subject: { description: '', descriptionPuck: null },
      layoutType: 'shop-category-description',
    })
    expect(el).toBeNull()
  })
})
