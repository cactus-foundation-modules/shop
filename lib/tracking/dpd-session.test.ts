import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchDpdParcel, mintDpdSession, setCookieLines } from '@/modules/shop/lib/tracking/dpd-session'

describe('setCookieLines', () => {
  it('reads sessionId from getSetCookie when the runtime has it', () => {
    const res = {
      headers: {
        getSetCookie: () => ['sessionId=abc; Path=/; HttpOnly'],
        get: () => null,
      },
    } as unknown as Response
    expect(setCookieLines(res)).toEqual(['sessionId=abc; Path=/; HttpOnly'])
  })

  it('falls back to the combined set-cookie header', () => {
    const res = {
      headers: {
        getSetCookie: undefined,
        get: (name: string) => (name === 'set-cookie' ? 'sessionId=abc; Path=/; HttpOnly' : null),
      },
    } as unknown as Response
    expect(setCookieLines(res)).toEqual(['sessionId=abc; Path=/; HttpOnly'])
  })
})

describe('mintDpdSession', () => {
  afterEach(() => vi.unstubAllGlobals())

  const redirect = (headers: Record<string, string>) =>
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 302, headers })))

  it('returns the cookie and the parcel number the short link redirects to', async () => {
    redirect({
      location: 'https://track.dpd.co.uk/parcels/15505217097035*21453',
      'set-cookie': 'sessionId=s%3Aabc; Path=/; HttpOnly',
    })
    expect(await mintDpdSession('6dPoGvP3DMDN')).toEqual({
      cookie: 'sessionId=s%3Aabc',
      parcelCode: '15505217097035*21453',
    })
  })

  it('still hands back the parcel number when no cookie came with it', async () => {
    redirect({ location: 'https://track.dpd.co.uk/parcels/15505217097035*21453' })
    expect(await mintDpdSession('6dPoGvP3DMDN')).toEqual({ cookie: null, parcelCode: '15505217097035*21453' })
  })

  it('has no parcel number when the redirect goes anywhere else', async () => {
    redirect({ location: 'https://track.dpd.co.uk/', 'set-cookie': 'sessionId=x; Path=/' })
    expect(await mintDpdSession('nonsense')).toEqual({ cookie: 'sessionId=x', parcelCode: null })
  })

  it('is null when the session was refused, although a cookie came with it', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', {
      status: 429,
      headers: { 'set-cookie': 'sessionId=useless; Path=/' },
    })))
    expect(await mintDpdSession('6dPoGvP3DMDN')).toBeNull()
  })

  it('asks for the parcel and its history one after the other, never together', async () => {
    let inFlight = 0
    let most = 0
    vi.stubGlobal('fetch', vi.fn(async () => {
      inFlight += 1
      most = Math.max(most, inFlight)
      await new Promise((resolve) => setTimeout(resolve, 5))
      inFlight -= 1
      return new Response('{"data":{}}', { status: 200 })
    }))
    await fetchDpdParcel('15505217097035*21453', 'sessionId=abc')
    expect(most).toBe(1)
  })

  it('is null when the request fails outright', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline') }))
    expect(await mintDpdSession('6dPoGvP3DMDN')).toBeNull()
  })
})
