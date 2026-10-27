import { afterEach, describe, expect, it, vi } from 'vitest'
import { dpdAddressPoint, dpdMapAvailable, dpdMapPoints, dpdMapRoutePath } from '@/modules/shop/lib/tracking/dpd'
import { fetchDpdMapLocation } from '@/modules/shop/lib/tracking/dpd-session'

// The Location DPD answered /map/route with on 27 October 2026 (DW order
// 969afc20…), van round the corner from the drop. Access token trimmed: it is
// theirs, and nothing here reads it.
const LOCATION = 'https://api.mapbox.com/styles/v1/mapbox/navigation-guidance-day-v4/static/'
  + 'url-https%3A%2F%2Fapis.track.dpd.co.uk%2Fv1%2Fmap%2Fmarkers%2Fhome%3Ftheme%3Ddpdgreen%26themeEvent%3Dnone%26size%3D120(-0.239019,51.49321),'
  + 'url-https%3A%2F%2Fapis.track.dpd.co.uk%2Fv1%2Fmap%2Fmarkers%2Fdriver%3Fsize%3D120%26theme%3Ddpdgreen%26themeEvent%3Dnone(-0.220614,51.490575)'
  + '/auto/1200x363@2x?logo=true&access_token=pk.x'

describe('dpdMapPoints', () => {
  it('reads the van and the drop off the overlays, lat and lng the right way round', () => {
    expect(dpdMapPoints(LOCATION)).toEqual({
      vehicle: { lat: '51.490575', lng: '-0.220614' },
      home: { lat: '51.49321', lng: '-0.239019' },
    })
  })

  it('tells the pins apart by marker, not by order', () => {
    const [head, rest] = LOCATION.split('static/')
    const [home, driver] = (rest as string).split('/auto/')[0]!.split('),url-')
    const swapped = `${head}static/url-${driver!.replace(/^url-/, '')}),url-${home!.replace(/^url-/, '')}/auto/x`
    expect(dpdMapPoints(swapped).vehicle).toEqual({ lat: '51.490575', lng: '-0.220614' })
  })

  it('gives no van on a map with only the home pin', () => {
    const homeOnly = LOCATION.split(',url-')[0] + '/auto/1200x363@2x'
    expect(dpdMapPoints(homeOnly)).toEqual({ vehicle: null, home: { lat: '51.49321', lng: '-0.239019' } })
  })

  it('refuses coordinates out of range and anything that is not one', () => {
    const bad = LOCATION.replace('(-0.220614,51.490575)', '(-0.220614,191.5)')
    expect(dpdMapPoints(bad).vehicle).toBeNull()
    expect(dpdMapPoints(null)).toEqual({ vehicle: null, home: null })
    expect(dpdMapPoints('https://example.com/')).toEqual({ vehicle: null, home: null })
  })
})

describe('the parcel payload', () => {
  const parcel = {
    data: {
      outForDeliveryDetails: { outForDelivery: true, mapAvailable: true },
      deliveryDetails: { address: { addressPoint: { latitude: 51.49321, longitude: -0.239019 } } },
    },
  }

  it('says when the van map is up', () => {
    expect(dpdMapAvailable(parcel)).toBe(true)
    expect(dpdMapAvailable({ data: { outForDeliveryDetails: { outForDelivery: true } } })).toBe(false)
    expect(dpdMapAvailable(null)).toBe(false)
  })

  it('reads their geocoded drop', () => {
    expect(dpdAddressPoint(parcel)).toEqual({ lat: '51.49321', lng: '-0.239019' })
    expect(dpdAddressPoint({ data: { deliveryDetails: { address: { addressPoint: { latitude: null, longitude: null } } } } }))
      .toBeNull()
  })

  it('asks for the map with the star left alone', () => {
    expect(dpdMapRoutePath('15505217100693*21484')).toBe('/map/route?parcelCode=15505217100693*21484&size=1200*600&themeEvent=none')
  })
})

describe('fetchDpdMapLocation', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('reads the redirect and never follows it', async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 302, headers: { location: LOCATION } }))
    vi.stubGlobal('fetch', fetchMock)
    await expect(fetchDpdMapLocation('15505217100693*21484', 'sessionId=abc')).resolves.toBe(LOCATION)
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(init.redirect).toBe('manual')
    expect((init.headers as Record<string, string>).cookie).toBe('sessionId=abc')
  })

  it('does not ask without a session, and gives nothing for a refusal', async () => {
    const fetchMock = vi.fn(async () => new Response('{"error":"Forbidden"}', { status: 403 }))
    vi.stubGlobal('fetch', fetchMock)
    await expect(fetchDpdMapLocation('15505217100693*21484', null)).resolves.toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
    await expect(fetchDpdMapLocation('15505217100693*21484', 'sessionId=abc')).resolves.toBeNull()
  })
})
