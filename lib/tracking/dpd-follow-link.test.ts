import { describe, expect, it } from 'vitest'
import { dpdFollowLink, dpdFollowLinkCode } from '@/modules/shop/lib/tracking/dpd-follow-link'

describe('dpdFollowLinkCode', () => {
  it('takes the code out of the link in their email', () => {
    expect(dpdFollowLinkCode('https://www.dpd.co.uk/d/6dPoGvP3DMDN')).toBe('6dPoGvP3DMDN')
  })

  it('forgives the link typed without https:// or www.', () => {
    expect(dpdFollowLinkCode('dpd.co.uk/d/6dPoGvP3DMDN')).toBe('6dPoGvP3DMDN')
    expect(dpdFollowLinkCode('http://dpd.co.uk/d/6dPoGvP3DMDN/')).toBe('6dPoGvP3DMDN')
    expect(dpdFollowLinkCode('  https://www.dpd.co.uk/d/6dPoGvP3DMDN  ')).toBe('6dPoGvP3DMDN')
  })

  it('refuses the long tracking page, which is the easy mistake to make', () => {
    expect(dpdFollowLinkCode('https://track.dpd.co.uk/parcels/15505217097035*21453')).toBeNull()
  })

  it('refuses a bare code, somebody else s link and a lookalike domain', () => {
    expect(dpdFollowLinkCode('6dPoGvP3DMDN')).toBeNull()
    expect(dpdFollowLinkCode('https://multidrop.link/abc123')).toBeNull()
    expect(dpdFollowLinkCode('https://www.notdpd.co.uk/d/6dPoGvP3DMDN')).toBeNull()
    expect(dpdFollowLinkCode('https://www.dpd.co.uk/d/6dPoGvP3DMDN?x=1')).toBeNull()
    expect(dpdFollowLinkCode(null)).toBeNull()
  })
})

describe('dpdFollowLink', () => {
  it('stores every accepted shape as the one link', () => {
    expect(dpdFollowLink('6dPoGvP3DMDN')).toBe('https://www.dpd.co.uk/d/6dPoGvP3DMDN')
  })
})
