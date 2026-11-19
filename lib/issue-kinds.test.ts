import { describe, expect, it } from 'vitest'
import {
  SHP_DAMAGE_REASONS,
  SHP_ISSUE_KINDS,
  isValidReason,
  issueKindOf,
  missingSuffix,
  reasonLabel,
} from '@/modules/shop/lib/order-requests'

describe('issue report kinds', () => {
  it('files every kind under codes the server accepts', () => {
    for (const kind of SHP_ISSUE_KINDS) {
      for (const code of kind.reasons) {
        expect(isValidReason('DAMAGE', code)).toBe(true)
        expect(issueKindOf(code)).toBe(kind.kind)
      }
    }
  })

  it('leaves no active damage reason without a kind', () => {
    const covered = new Set(SHP_ISSUE_KINDS.flatMap((kind) => kind.reasons))
    for (const reason of SHP_DAMAGE_REASONS) expect(covered.has(reason.code)).toBe(true)
  })

  it('refuses the retired parts-missing code but still reads it as English', () => {
    expect(isValidReason('DAMAGE', 'PARTS_MISSING')).toBe(false)
    expect(reasonLabel('DAMAGE', 'PARTS_MISSING')).toBe('Parts are missing or broken')
    expect(issueKindOf('PARTS_MISSING')).toBe('MISSING')
  })

  it('says whole or parts after a missing line and nothing otherwise', () => {
    expect(missingSuffix({ missing: 'WHOLE' })).toBe(' (missing entirely)')
    expect(missingSuffix({ missing: 'PARTS' })).toBe(' (parts missing)')
    expect(missingSuffix({ missing: null })).toBe('')
    expect(missingSuffix({})).toBe('')
  })
})

describe('add-photos link', () => {
  it('opens the add-photos form and survives the postcode gate', async () => {
    const { ADD_PHOTOS_QUERY_KEY, addPhotosUrl } = await import('@/modules/shop/lib/order-requests')
    const { orderLinkIntentQuery } = await import('@/modules/shop/lib/order-link-intent')
    const url = new URL(addPhotosUrl('https://shop.test/shop/track-order/DW1?t=abc'))
    expect(url.searchParams.get(ADD_PHOTOS_QUERY_KEY)).toBe('1')
    expect(url.searchParams.get('t')).toBe('abc')
    expect(addPhotosUrl('')).toBe('')
    expect(orderLinkIntentQuery({ [ADD_PHOTOS_QUERY_KEY]: '1' })).toBe(`?${ADD_PHOTOS_QUERY_KEY}=1`)
  })
})
