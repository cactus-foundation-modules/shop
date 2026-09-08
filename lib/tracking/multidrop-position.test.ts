import { describe, it, expect, vi, afterEach } from 'vitest'
import { fetchVehiclePosition, positionUrl } from '@/modules/shop/lib/tracking/multidrop-position'
import { cachedVehiclePosition, resetPositionCache } from '@/modules/shop/lib/tracking/position-cache'

const LONDON = 'Europe/London'
const TRACKING_URL = 'https://multidrop.link/AAAAAA/AA0AA'

function reply(body: unknown, ok = true): Response {
  return { ok, json: async () => body } as Response
}

afterEach(() => {
  vi.restoreAllMocks()
  resetPositionCache()
})

describe('positionUrl', () => {
  it('builds the address off the tracking link\'s own origin', () => {
    expect(positionUrl(TRACKING_URL, '4', '284790'))
      .toBe('https://multidrop.link/?action=get_latest_location&cl=4&route=284790')
  })

  it('will not build one for a link that is not theirs', () => {
    // The tracking URL is typed in by a member of staff. Without this check a
    // typo - or worse - turns into an outbound request from the site's server.
    expect(positionUrl('https://evil.example.com/x', '4', '284790')).toBeNull()
    expect(positionUrl('https://multidrop.link.example.com/x', '4', '284790')).toBeNull()
  })

  it('will not put anything but digits in the query', () => {
    expect(positionUrl(TRACKING_URL, '4&x=1', '284790')).toBeNull()
    expect(positionUrl(TRACKING_URL, '4', '../../etc')).toBeNull()
  })
})

describe('fetchVehiclePosition', () => {
  it('reads the reply they actually send', () => {
    vi.stubGlobal('fetch', vi.fn(async () => reply({
      vehicle_lng: '-0.027551', vehicle_lat: '51.535283', heading: 157, timestamp: '08/09/2026 14:11:44',
    })))
    return expect(fetchVehiclePosition('https://multidrop.link/?action=get_latest_location', LONDON))
      .resolves.toEqual({
        lat: '51.535283',
        lng: '-0.027551',
        heading: 157,
        fixedAt: new Date('2026-09-08T13:11:44.000Z'),
      })
  })

  it('copes with numbers where there were strings', () => {
    // Their coordinates are strings today. A release of theirs that made them
    // numbers should move a van, not throw inside a page render.
    vi.stubGlobal('fetch', vi.fn(async () => reply({
      vehicle_lng: -0.027551, vehicle_lat: 51.535283, heading: '157', timestamp: null,
    })))
    return expect(fetchVehiclePosition('https://multidrop.link/x', LONDON)).resolves.toMatchObject({
      lat: '51.535283', lng: '-0.027551', heading: 157, fixedAt: null,
    })
  })

  it('gives nothing for half a position', () => {
    vi.stubGlobal('fetch', vi.fn(async () => reply({ vehicle_lat: '51.5', vehicle_lng: null })))
    return expect(fetchVehiclePosition('https://multidrop.link/x', LONDON)).resolves.toBeNull()
  })

  it('gives nothing for a reply that is not theirs, or no reply at all', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => reply({ error: 'nope' })))
    await expect(fetchVehiclePosition('https://multidrop.link/x', LONDON)).resolves.toBeNull()

    vi.stubGlobal('fetch', vi.fn(async () => reply({}, false)))
    await expect(fetchVehiclePosition('https://multidrop.link/x', LONDON)).resolves.toBeNull()

    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('socket hang up') }))
    await expect(fetchVehiclePosition('https://multidrop.link/x', LONDON)).resolves.toBeNull()
  })
})

describe('cachedVehiclePosition', () => {
  const position = { lat: '51.5', lng: '-0.1', heading: null, fixedAt: null }

  it('asks the courier once for everyone watching the same round', async () => {
    const load = vi.fn(async () => position)
    const first = await cachedVehiclePosition('4:284790', load, 1_000)
    const second = await cachedVehiclePosition('4:284790', load, 1_500)

    expect(load).toHaveBeenCalledTimes(1)
    expect(first.fetched).toBe(true)
    expect(second.fetched).toBe(false)
    expect(second.position).toEqual(position)
  })

  it('shares one request between callers who arrive together', async () => {
    // Four tabs loading in the same second is the normal case, not the odd one.
    const load = vi.fn(() => new Promise<typeof position>((resolve) => setTimeout(() => resolve(position), 5)))
    const answers = await Promise.all([
      cachedVehiclePosition('4:1', load, 1_000),
      cachedVehiclePosition('4:1', load, 1_000),
      cachedVehiclePosition('4:1', load, 1_000),
    ])

    expect(load).toHaveBeenCalledTimes(1)
    expect(answers.every((a) => a.position === position)).toBe(true)
  })

  it('asks again once the answer is old enough', async () => {
    const load = vi.fn(async () => position)
    await cachedVehiclePosition('4:2', load, 1_000)
    await cachedVehiclePosition('4:2', load, 1_000 + 31_000)
    expect(load).toHaveBeenCalledTimes(2)
  })

  it('keeps rounds apart', async () => {
    const load = vi.fn(async () => position)
    await cachedVehiclePosition('4:100', load, 1_000)
    await cachedVehiclePosition('4:200', load, 1_000)
    expect(load).toHaveBeenCalledTimes(2)
  })
})
