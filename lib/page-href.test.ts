import { describe, expect, it } from 'vitest'
import { pageFromParams, pageHref, withPageParam } from '@/modules/shop/lib/page-href'

// The addresses a crawler walks to find the rest of a shelf. Worth pinning
// because the failure is silent in the worst way: the links still look right,
// the shop still works for shoppers, and the only symptom is products quietly
// dropping out of search months later.

describe('pageFromParams', () => {
  it('reads a page number off a query string', () => {
    expect(pageFromParams(new URLSearchParams('page=3'))).toBe(3)
    expect(pageFromParams(new URLSearchParams('colour=blue&page=7'))).toBe(7)
  })

  it('reads one off a params object, first value wins for a repeated key', () => {
    expect(pageFromParams({ page: '4' })).toBe(4)
    expect(pageFromParams({ page: ['2', '9'] })).toBe(2)
  })

  it('is page one for anything absent, empty or not a page', () => {
    for (const input of [null, undefined, {}, new URLSearchParams('')]) {
      expect(pageFromParams(input)).toBe(1)
    }
    for (const value of ['banana', '', '0', '-4', '1.5', 'NaN', 'Infinity']) {
      expect(pageFromParams({ page: value })).toBe(1)
    }
  })

  it('is page one for page=1, so the first page has one address and not two', () => {
    expect(pageFromParams({ page: '1' })).toBe(1)
  })
})

describe('withPageParam', () => {
  it('adds the parameter', () => {
    expect(withPageParam('', 2)).toBe('?page=2')
    expect(withPageParam('?colour=blue', 3)).toBe('?colour=blue&page=3')
  })

  it('replaces one already there rather than adding a second', () => {
    expect(withPageParam('?page=2', 5)).toBe('?page=5')
    expect(withPageParam('?colour=blue&page=2&sort=price', 6)).toBe('?colour=blue&page=6&sort=price')
  })

  it('drops the parameter for page one - one address for the first page', () => {
    expect(withPageParam('?page=4', 1)).toBe('')
    expect(withPageParam('?colour=blue&page=4', 1)).toBe('?colour=blue')
  })

  it('keeps every other parameter, which is what keeps a filtered view filtered', () => {
    expect(withPageParam('?colour=blue&size=large&sort=price', 2))
      .toBe('?colour=blue&size=large&sort=price&page=2')
  })

  it('takes a query with or without its leading question mark', () => {
    expect(withPageParam('colour=blue', 2)).toBe('?colour=blue&page=2')
    expect(withPageParam('?colour=blue', 2)).toBe('?colour=blue&page=2')
  })
})

describe('pageHref', () => {
  it('is a bare query string, so it resolves against whatever path serves it', () => {
    expect(pageHref('', 2)).toBe('?page=2')
    expect(pageHref('?colour=blue', 2)).toBe('?colour=blue&page=2')
  })

  it('never returns an empty href - back to page one from nowhere is still a link', () => {
    expect(pageHref('', 1)).toBe('?')
  })

  it('round-trips: the href for page N reads back as page N', () => {
    for (const page of [2, 3, 9, 40]) {
      expect(pageFromParams(new URLSearchParams(pageHref('?colour=blue', page)))).toBe(page)
    }
  })
})
