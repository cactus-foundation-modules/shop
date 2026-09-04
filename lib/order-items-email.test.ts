import { describe, it, expect } from 'vitest'
import { absoluteImageUrl, productEmailUrl, renderOrderItemsTable, type OrderEmailLine } from '@/modules/shop/lib/order-items-email'

const line = (over: Partial<OrderEmailLine> = {}): OrderEmailLine => ({
  name: 'Capra Mesh Back Chair',
  quantity: 1,
  price: '£138.00',
  imageUrl: 'https://cdn.test/capra.jpg',
  ...over,
})

describe('absoluteImageUrl', () => {
  it('leaves an absolute url alone', () => {
    expect(absoluteImageUrl('https://cdn.test/a.jpg', 'https://shop.test')).toBe('https://cdn.test/a.jpg')
  })

  it('qualifies a site-relative one, without doubling the slash', () => {
    expect(absoluteImageUrl('/media/a.jpg', 'https://shop.test/')).toBe('https://shop.test/media/a.jpg')
  })

  // An inbox has no origin to resolve against, so a half-address is a broken
  // picture rather than a picture worth risking.
  it('drops anything that is neither absolute nor site-relative', () => {
    expect(absoluteImageUrl('media/a.jpg', 'https://shop.test')).toBeNull()
    expect(absoluteImageUrl('javascript:alert(1)', 'https://shop.test')).toBeNull()
    expect(absoluteImageUrl('', 'https://shop.test')).toBeNull()
    expect(absoluteImageUrl(null, 'https://shop.test')).toBeNull()
  })
})

describe('productEmailUrl', () => {
  it('builds an absolute link in the shop’s chosen style', () => {
    expect(productEmailUrl('capra-chair', 'https://shop.test', 'SHOP')).toBe('https://shop.test/shop/products/capra-chair')
    expect(productEmailUrl('capra-chair', 'https://shop.test/', 'ROOT')).toBe('https://shop.test/capra-chair')
  })

  // A variation is a catalogue-hidden child product with its own slug, and the
  // product page resolves it back to the parent with that variation chosen. So
  // the link for a variation line is simply the line's own slug.
  it('links a variation by its own slug, which is what the shop publishes', () => {
    expect(productEmailUrl('capra-chair-black', 'https://shop.test', 'SHOP'))
      .toBe('https://shop.test/shop/products/capra-chair-black')
  })

  it('gives nothing where there is nothing safe to point at', () => {
    expect(productEmailUrl(null, 'https://shop.test', 'SHOP')).toBeNull()
    expect(productEmailUrl('  ', 'https://shop.test', 'SHOP')).toBeNull()
    // No site url means a relative path, which resolves to nothing in an inbox.
    expect(productEmailUrl('capra-chair', '', 'SHOP')).toBeNull()
  })
})

describe('renderOrderItemsTable', () => {
  it('prints nothing at all for no lines', () => {
    expect(renderOrderItemsTable([])).toBe('')
  })

  it('gives every line its own row, so nothing runs together', () => {
    const html = renderOrderItemsTable([line(), line({ name: 'Impulse Desk', price: '£135.00' })])
    expect(html.match(/<tr>/g)?.length).toBe(3) // header plus two lines
    expect(html).toContain('Capra Mesh Back Chair')
    expect(html).toContain('Impulse Desk')
  })

  it('shows the photograph, sized and bordered inline', () => {
    const html = renderOrderItemsTable([line()])
    expect(html).toContain('<img src="https://cdn.test/capra.jpg"')
    expect(html).toContain('width="64" height="64"')
    // Decorative: the name is in the cell beside it.
    expect(html).toContain('alt=""')
  })

  it('leaves the picture column out entirely when nothing has one', () => {
    const html = renderOrderItemsTable([line({ imageUrl: null })])
    expect(html).not.toContain('<img')
  })

  it('keeps the columns lined up when only some lines have a picture', () => {
    const html = renderOrderItemsTable([line(), line({ name: 'Unphotographed', imageUrl: null })])
    expect(html).toContain('<img')
    // The pictureless line still has its cell, or its name slides left.
    expect(html.match(/&nbsp;/g)?.length).toBeGreaterThanOrEqual(2)
  })

  it('drops the price column for a list that carries no prices', () => {
    const html = renderOrderItemsTable([{ name: 'Impulse Desk', quantity: 2 }])
    expect(html).not.toContain('Price')
    expect(html).toContain('Qty')
  })

  it('prints personalisation under the product name', () => {
    const html = renderOrderItemsTable([line({ extras: [{ label: 'Delivery', value: 'Flat-Pack' }] })])
    expect(html).toContain('Delivery: Flat-Pack')
  })

  // The value goes into the template unescaped, so everything printed here has
  // to be escaped on the way in - a product name is typed by somebody.
  it('escapes the values it prints', () => {
    const html = renderOrderItemsTable([
      line({ name: 'Chair <script>alert(1)</script>', extras: [{ label: 'Note', value: '"quoted" & <b>bold</b>' }] }),
    ])
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
    expect(html).toContain('&amp;')
  })

  it('escapes an image url rather than trusting it into an attribute', () => {
    const html = renderOrderItemsTable([line({ imageUrl: 'https://cdn.test/a.jpg?a=1&b="2' })])
    expect(html).toContain('&amp;b=&quot;2')
  })

  it('links the name and the photograph to the product when there is a link', () => {
    const html = renderOrderItemsTable([line({ url: 'https://shop.test/shop/products/capra-chair' })])
    expect(html).toContain('<a href="https://shop.test/shop/products/capra-chair"')
    // Both the words and the picture go to the same place.
    expect(html.match(/<a href="https:\/\/shop\.test\/shop\/products\/capra-chair"/g)?.length).toBe(2)
  })

  it('leaves the name as plain text when there is no link', () => {
    const html = renderOrderItemsTable([line({ url: null })])
    expect(html).not.toContain('<a href')
    expect(html).toContain('Capra Mesh Back Chair')
  })

  it('escapes a product link rather than trusting it into an attribute', () => {
    const html = renderOrderItemsTable([line({ imageUrl: null, url: 'https://shop.test/p?a=1&b="2' })])
    expect(html).toContain('&amp;b=&quot;2')
  })

  it('uses no CSS custom properties, which no mail client resolves', () => {
    expect(renderOrderItemsTable([line()])).not.toContain('var(--')
  })
})
