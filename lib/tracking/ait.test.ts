import { afterEach, describe, expect, it, vi } from 'vitest'
import { aitLink, aitLinkParts } from '@/modules/shop/lib/tracking/ait-link'
import { aitDetailsUrl, aitSignature, readAit, readAitPayload, resetAitCache } from '@/modules/shop/lib/tracking/ait'
import outForDelivery from '@/modules/shop/lib/tracking/__fixtures__/ait-out-for-delivery.json'

// Their real reply, captured 9 October 2026 from a Deskwell parcel out for
// delivery (drop 21 of 21, driver on drop 5). Phone numbers replaced with
// Ofcom's drama range; everything else as they sent it.

describe('aitLinkParts', () => {
  it('takes the code out of their short link, in any of the shapes it gets pasted', () => {
    expect(aitLinkParts('https://aithd.com/kz0vkrz')).toEqual({ region: 'com', code: 'kz0vkrz' })
    expect(aitLinkParts('aithd.com/kz0vkrz/')).toEqual({ region: 'com', code: 'kz0vkrz' })
    expect(aitLinkParts('http://www.aithd.com/kz0vkrz')).toEqual({ region: 'com', code: 'kz0vkrz' })
    expect(aitLinkParts('https://aithd.de/abc12de')).toEqual({ region: 'de', code: 'abc12de' })
    expect(aitLinkParts('https://aithd.com/kz0vkrz?utm_source=sms#top')).toEqual({ region: 'com', code: 'kz0vkrz' })
  })

  // The long form is a page in a browser, not a key their feed accepts.
  it('refuses the long address, a bare code and other sites', () => {
    expect(aitLinkParts('https://aithd.com/11093/972140')).toBeNull()
    expect(aitLinkParts('kz0vkrz')).toBeNull()
    expect(aitLinkParts('https://evil.example/kz0vkrz')).toBeNull()
    expect(aitLinkParts('https://aithd.com.evil.example/kz0vkrz')).toBeNull()
    expect(aitLinkParts(null)).toBeNull()
  })

  it('stores one canonical shape', () => {
    expect(aitLink({ region: 'com', code: 'kz0vkrz' })).toBe('https://aithd.com/kz0vkrz')
  })
})

describe('aitDetailsUrl', () => {
  it('asks the feed their own page asks, by region', () => {
    expect(aitDetailsUrl('https://aithd.com/kz0vkrz'))
      .toBe('https://public-api.uk.aithomedelivery.com/apiv2/anon/tracking/details?key=kz0vkrz')
    expect(aitDetailsUrl('https://aithd.de/kz0vkrz'))
      .toBe('https://public-api.de.aithomedelivery.com/apiv2/anon/tracking/details?key=kz0vkrz')
  })

  it('never builds a request out of anything else', () => {
    expect(aitDetailsUrl('https://example.com/kz0vkrz')).toBeNull()
  })
})

describe('readAitPayload - out for delivery', () => {
  const reading = readAitPayload(outForDelivery)

  it('says out for delivery, from their code', () => {
    expect(reading?.stage).toBe('Out for delivery')
    expect(reading?.outForDelivery).toBe(true)
    expect(reading?.delivered).toBe(false)
  })

  it('reads the two-hour window as instants', () => {
    // 11:27-13:27 BST on their page.
    expect(reading?.windowFrom?.toISOString()).toBe('2026-10-09T10:27:00.000Z')
    expect(reading?.windowTo?.toISOString()).toBe('2026-10-09T12:27:00.000Z')
  })

  it('reads the drops the way their own page does', () => {
    expect(reading?.stopNumber).toBe(21)
    expect(reading?.stopsCompleted).toBe(5)
    expect(reading?.stopsTotal).toBe(21)
    expect(reading?.dropsAway).toBe(16)
  })

  it('gives the driver by first name only, with a capital', () => {
    expect(reading?.driverName).toBe('Alex')
  })

  it('puts the van and the drop on the map', () => {
    expect(reading?.vehicle).toEqual({ lat: '51.517136', lng: '-0.086677' })
    expect(reading?.destinationLat).toBe('51.5131437')
    expect(reading?.destinationLng).toBe('-0.0826096')
  })

  it('keeps the history newest first, in their wall-clock time', () => {
    expect(reading?.events[0]).toEqual({ at: '2026-10-09T07:31:36', location: '', text: 'Order out for delivery' })
    expect(reading?.events.at(-1)).toEqual({ at: '2026-10-08T17:12:11', location: '', text: 'Order confirmed' })
    expect(reading?.events).toContainEqual({
      at: '2026-10-08T17:22:07',
      location: '',
      text: 'Order scheduled for delivery - Booked for 2026-10-09 00:00:00',
    })
  })

  it('has no signature while it is still on the van', () => {
    expect(reading?.signatureImageUrl).toBeNull()
    expect(reading?.receivedBy).toBeNull()
  })

  it('never carries a phone number anywhere', () => {
    expect(JSON.stringify(reading)).not.toMatch(/07700900/)
  })
})

describe('readAitPayload - after the van has been', () => {
  const delivered = {
    ...outForDelivery,
    orderStatusID: 'D',
    customerSignature: 'https://s3.eu-west-2.amazonaws.com/example/signature.png',
    trackingDetails: [
      ...outForDelivery.trackingDetails,
      { historyDateTimeStamp: 1791548000000, historyDateTime: '2026-10-09 13:13:20', historyStatus: 'Order delivered', historyDetails: '' },
    ],
  }

  it('says delivered, takes the signature image and stops drawing the van', () => {
    const reading = readAitPayload(delivered)
    expect(reading?.stage).toBe('Delivered')
    expect(reading?.delivered).toBe(true)
    expect(reading?.outForDelivery).toBe(false)
    expect(reading?.signatureImageUrl).toBe('https://s3.eu-west-2.amazonaws.com/example/signature.png')
    expect(reading?.receivedAt?.toISOString()).toBe(new Date(1791548000000).toISOString())
    expect(reading?.vehicle).toBeNull()
    expect(reading?.stopNumber).toBeNull()
    expect(reading?.dropsAway).toBeNull()
  })

  it('keeps a name where the field turns out to hold one', () => {
    const reading = readAitPayload({ ...delivered, customerSignature: 'J SMITH' })
    expect(reading?.receivedBy).toBe('J SMITH')
    expect(reading?.signatureImageUrl).toBeNull()
  })

  // A name on a failed or partial parcel would be filed as "signed for", which
  // the customer's page reads as arrived over the top of the failure.
  it('believes the signature field only on a delivered parcel', () => {
    const failed = readAitPayload({ ...delivered, orderStatusID: 'UD', customerSignature: 'J SMITH' })
    expect(failed?.receivedBy).toBeNull()
    expect(failed?.signatureImageUrl).toBeNull()
  })

  it('puts their reason for a failed attempt after the stage', () => {
    const reading = readAitPayload({ ...outForDelivery, orderStatusID: 'UD', failureCodeReason: 'No access to property' })
    expect(reading?.stage).toBe('Unsuccessful - No access to property')
    expect(reading?.delivered).toBe(false)
    expect(reading?.outForDelivery).toBe(false)
  })
})

describe('aitSignature', () => {
  it('reads "N/A" and blank as not yet', () => {
    expect(aitSignature('N/A')).toEqual({ imageUrl: null, name: null })
    expect(aitSignature('')).toEqual({ imageUrl: null, name: null })
  })

  it('takes https only', () => {
    expect(aitSignature('http://example.com/sig.png')).toEqual({ imageUrl: null, name: null })
    expect(aitSignature('https://user:pw@example.com/sig.png')).toEqual({ imageUrl: null, name: null })
    expect(aitSignature('data:image/png;base64,AAAA')).toEqual({ imageUrl: null, name: null })
  })
})

describe('readAitPayload - a code it does not know', () => {
  it('uses their newest history line, but never one that names a stage meaning', () => {
    const known = readAitPayload({ ...outForDelivery, orderStatusID: 'Q' })
    expect(known?.stage).toBe('Order out for delivery')
    const clash = readAitPayload({
      ...outForDelivery,
      orderStatusID: 'ZZ',
      trackingDetails: [{ historyDateTimeStamp: 1, historyDateTime: '2026-10-09 09:00:00', historyStatus: 'Delivered', historyDetails: '' }],
    })
    expect(clash?.stage).toBe('Status ZZ')
    expect(clash?.delivered).toBe(false)
  })
})

describe('readAitPayload - not a parcel', () => {
  it('learns nothing from an error or a page', () => {
    expect(readAitPayload({ error: 'Not found' })).toBeNull()
    expect(readAitPayload('<html></html>')).toBeNull()
  })
})

describe('readAit', () => {
  afterEach(() => {
    resetAitCache()
    vi.unstubAllGlobals()
  })

  it('sends their own tracking page as the Referer, and asks once for many viewers', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(outForDelivery), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const [a, b] = await Promise.all([readAit('https://aithd.com/kz0vkrz', 1000), readAit('https://aithd.com/kz0vkrz', 1000)])
    const again = await readAit('https://aithd.com/kz0vkrz', 20_000)

    expect(a?.stage).toBe('Out for delivery')
    expect(b).toBe(a)
    expect(again).toBe(a)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const init = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1]
    expect((init.headers as Record<string, string>).referer).toBe('https://aithd.com/')
  })

  it('learns nothing, without throwing, when their feed refuses', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('Forbidden', { status: 403 })))
    expect(await readAit('https://aithd.com/kz0vkrz')).toBeNull()
  })
})
