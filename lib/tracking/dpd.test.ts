import { describe, expect, it } from 'vitest'
import {
  dpdDepotCode,
  dpdFeedSaysDelivered,
  dpdImageHeaders,
  dpdImageUrl,
  dpdPodImage,
  dpdDriverId,
  dpdDriverName,
  dpdEvents,
  dpdParcelCodeFromUrl,
  dpdRouteCode,
  dpdShortCodeFromUrl,
  dpdStatusWindow,
  readDpd,
} from '@/modules/shop/lib/tracking/dpd'

// Captured 10 September 2026 from a parcel out for delivery. The anonymous
// payload is what any reader gets; the session one is what the follow-my-parcel
// code unlocks. Both are real, because the difference between them is the whole
// reason this reader has two halves.
const STATUS_HTML = 'Your Dynamic Office Seating Ltd order will be delivered today by '
  + '<SPAN class="REDTEXT">Mozam</SPAN>, your DPD driver,'
  + '<SPAN class="REDTEXT"> between 11:41 and 12:41</SPAN>. Your one hour timeslot can\'t be changed'

const ANONYMOUS = {
  data: {
    parcelCode: '15505217095248*21437',
    parcelNumber: '1550 5217 095 248 9',
    consignmentNumber: '5217095248',
    trackingStatusCurrent: 'Your Dynamic Office Seating Ltd order will be delivered today by Mozam…',
    parcelStatusHtml: STATUS_HTML,
    consumer: null,
    parcelStatusInfo: null,
    // Zero for the entire journey, out-for-delivery included. It is not a state
    // machine and nothing keys off it.
    parcelStatusType: 0,
  },
}

const SESSION = {
  data: {
    ...ANONYMOUS.data,
    deliveredToConsumer: false,
    deliveryDepot: {
      depotCode: '0045',
      route: {
        routeCode: '0045*21438*215*3600',
        stop: {
          deliveryWindowFrom: '2026-09-10 11:41:00',
          deliveryWindowTo: '2026-09-10 12:41:00',
          stopNumber: 34,
          estimatedMinsToStop: 90,
        },
      },
    },
  },
}

const EVENTS = {
  data: [
    { eventDate: '2026-09-10 09:41:00', eventLocation: 'DPD', eventText: 'Your parcel will be with you today  between 11:41 and 12:41' },
    { eventDate: '2026-09-09 19:01:00', eventLocation: 'Dynamic Office Seating Ltd', eventText: "We've received your order details, and we're expecting your parcel shortly" },
  ],
}

const ROUTE = {
  data: {
    routeCode: '0045*21438*215*3600',
    depotCode: '0045',
    driverCode: 'DR62251',
    driverDisplayName: 'Mozam',
    completedDeliveryStops: 9,
    totalDeliveryStops: 98,
  },
}

describe('dpdParcelCodeFromUrl', () => {
  it('keeps the star, which is a path segment to them and not a wildcard', () => {
    expect(dpdParcelCodeFromUrl('https://track.dpd.co.uk/parcels/15505217095248*21437'))
      .toBe('15505217095248*21437')
  })

  it('is null for somebody else s tracking page', () => {
    expect(dpdParcelCodeFromUrl('https://multidrop.link/abc')).toBeNull()
    expect(dpdParcelCodeFromUrl(null)).toBeNull()
  })
})

describe('dpdShortCodeFromUrl', () => {
  it('takes the code out of the emailed link', () => {
    expect(dpdShortCodeFromUrl('https://www.dpd.co.uk/d/6dPoGe7yvJAW')).toBe('6dPoGe7yvJAW')
  })

  // An owner pasting from an email is as likely to paste the code as the
  // address, and refusing them costs the parcel its live tracking.
  it('accepts the bare code too', () => {
    expect(dpdShortCodeFromUrl('6dPoGe7yvJAW')).toBe('6dPoGe7yvJAW')
    expect(dpdShortCodeFromUrl('  6dPoGe7yvJAW  ')).toBe('6dPoGe7yvJAW')
  })

  it('refuses a tracking link, which is the easy mistake to make', () => {
    expect(dpdShortCodeFromUrl('https://track.dpd.co.uk/parcels/15505217095248*21437')).toBeNull()
  })
})

describe('dpdDriverName', () => {
  it('reads the name out of their own markup rather than out of the words', () => {
    expect(dpdDriverName(STATUS_HTML)).toBe('Mozam')
  })

  // The other span in that sentence is the timeslot.
  it('never returns the time window as a name', () => {
    expect(dpdDriverName('<SPAN class="REDTEXT"> between 11:41 and 12:41</SPAN>')).toBeNull()
  })

  it('is null before they have named a driver', () => {
    expect(dpdDriverName('We are expecting your parcel shortly')).toBeNull()
    expect(dpdDriverName(null)).toBeNull()
  })
})

describe('dpdStatusWindow', () => {
  it('reads the one-hour slot out of the sentence', () => {
    expect(dpdStatusWindow(STATUS_HTML)).toEqual({ start: '11:41', end: '12:41' })
  })

  it('is null when they have not committed to one', () => {
    expect(dpdStatusWindow('Your parcel has arrived at our depot')).toBeNull()
  })
})

describe('dpdEvents', () => {
  it('reads their history newest first', () => {
    const events = dpdEvents(EVENTS)
    expect(events).toHaveLength(2)
    expect(events[0]?.at).toBe('2026-09-10T09:41:00')
    expect(events[1]?.location).toBe('Dynamic Office Seating Ltd')
  })

  // Their timestamps have a space rather than a T and no offset at all, which
  // is not a date to every runtime that might parse it.
  it('normalises their timestamps without moving them', () => {
    expect(dpdEvents(EVENTS)[1]?.at).toBe('2026-09-09T19:01:00')
  })

  it('reads nothing out of a shape it does not know', () => {
    expect(dpdEvents({ data: 'nope' })).toEqual([])
    expect(dpdEvents(null)).toEqual([])
  })
})

describe('readDpd', () => {
  it('reads the anonymous payload without inventing what it cannot see', () => {
    const reading = readDpd({ parcel: ANONYMOUS, events: EVENTS, timezone: 'Europe/London' })
    // The stage is the newest SCAN, not the status sentence: the sentence names
    // the shipper, the driver and the timeslot, so no two parcels would ever
    // produce a string a setting could match.
    expect(reading.stage).toBe('Your parcel will be with you today  between 11:41 and 12:41')
    expect(reading.driverName).toBe('Mozam')
    expect(reading.stopNumber).toBeNull()
    expect(reading.windowFrom).toBeNull()
    expect(reading.minutesToStop).toBeNull()
  })

  it('reads the round out of the session payload', () => {
    const reading = readDpd({ parcel: SESSION, events: EVENTS, route: ROUTE, timezone: 'Europe/London' })
    expect(reading.stopNumber).toBe(34)
    expect(reading.stopsCompleted).toBe(9)
    expect(reading.stopsTotal).toBe(98)
    expect(reading.minutesToStop).toBe(90)
    // British Summer Time: 11:41 on their page is 10:41 UTC. Before this was
    // fixed the instant was built on the server's clock and every delivery
    // read an hour late.
    expect(reading.windowFrom?.toISOString()).toBe('2026-09-10T10:41:00.000Z')
    expect(reading.windowTo?.toISOString()).toBe('2026-09-10T11:41:00.000Z')
  })

  // Somebody else's feed: a field that is null today and an object tomorrow is
  // normal, and a reader that threw would stop tracking every parcel at once.
  it('survives a payload that has changed shape', () => {
    const reading = readDpd({ parcel: { data: { deliveryDepot: 'unexpected' } }, events: EVENTS, timezone: 'Europe/London' })
    expect(reading.stage).toBe('Your parcel will be with you today  between 11:41 and 12:41')
    expect(reading.stopNumber).toBeNull()
  })

  it('learns nothing when both feeds are empty', () => {
    expect(readDpd({ parcel: null, events: null, timezone: 'Europe/London' }).stage).toBeNull()
  })
})

describe('route and driver ids', () => {
  it('finds the round only once the parcel is on one', () => {
    expect(dpdRouteCode(SESSION)).toBe('0045*21438*215*3600')
    expect(dpdRouteCode(ANONYMOUS)).toBeNull()
    expect(dpdDepotCode(SESSION)).toBe('0045')
  })

  // Their driver endpoint wants depot and driver joined by a star. The bare
  // driver code returns 403, which reads like a permissions problem and is not.
  it('joins depot and driver the way their endpoint wants', () => {
    expect(dpdDriverId('0045', 'DR62251')).toBe('0045*DR62251')
    expect(dpdDriverId(null, 'DR62251')).toBeNull()
    expect(dpdDriverId('0045', null)).toBeNull()
  })
})

// The delivered payload, captured the moment DW000182 landed on 10 September
// 2026. DPD no longer take a signature: they photograph the parcel where they
// left it, and name whoever took it in.
const DELIVERED = {
  data: {
    ...SESSION.data,
    trackingStatusCurrent: 'Your parcel has been delivered and received by BECKLEY at 12:20 on Thu 10 Sep 2026',
    deliveredToConsumer: true,
    undelivered: false,
    outForDeliveryDetails: { outForDelivery: true, mapAvailable: false },
    deliveryDetails: {
      podDetails: {
        podName: 'Beckley',
        podNeighbour: null,
        podSafePlaceCode: null,
        podDate: '2026-09-10 12:20:00',
        podDriverCode: 'DR62251',
      },
    },
    image: [{ key: '0045*21438*215*3600*22*001*0*1', caption: 'Delivered to recipient', type: 'S5', subType: 'P' }],
  },
}

describe('dpdFeedSaysDelivered', () => {
  it('trusts the session boolean when DPD give one', () => {
    expect(dpdFeedSaysDelivered({ deliveredToConsumer: true, trackingStatusCurrent: '' }, [])).toBe(true)
  })

  it('reads delivery from the anonymous events feed when the boolean is absent', () => {
    const events = dpdEvents({
      data: [{ eventDate: '2026-09-15 11:53:00', eventLocation: 'Preston', eventText: 'Your parcel has been delivered' }],
    })
    expect(dpdFeedSaysDelivered(null, events)).toBe(true)
  })

  it('does not call a failed delivery a delivery', () => {
    expect(dpdFeedSaysDelivered(null, [{ at: '2026-09-15T09:00:00', location: '', text: 'NOT DELIVERED - CUSTOMER NOT IN' }])).toBe(null)
  })
})

describe('proof of delivery', () => {
  it('reads who took it and when, in their spelling', () => {
    const reading = readDpd({ parcel: DELIVERED, events: EVENTS, timezone: 'Europe/London' })
    expect(reading.receivedBy).toBe('Beckley')
    expect(reading.receivedAt?.toISOString()).toBe('2026-09-10T11:20:00.000Z')
    expect(reading.delivered).toBe(true)
  })

  it('finds the photograph only once there is one', () => {
    expect(dpdPodImage(DELIVERED)).toEqual({ key: '0045*21438*215*3600*22*001*0*1', imageType: 'S5' })
    // Out for delivery but not yet handed over: no picture exists.
    expect(dpdPodImage(SESSION)).toBeNull()
    expect(dpdPodImage(ANONYMOUS)).toBeNull()
  })

  it('builds the address that actually serves it', () => {
    const url = dpdImageUrl('15505217095248*21437', { key: '0045*21438*215*3600*22*001*0*1', imageType: 'S5' })
    expect(url).toBe(
      'https://apis.track.dpd.co.uk/v1/parcels/15505217095248*21437'
      + '/images/0045*21438*215*3600*22*001*0*1?imageType=S5',
    )
  })

  // Both headers are load-bearing and the Referer is the surprising one: the
  // tracking site's ROOT is accepted where the address naming the parcel - the
  // one a browser would really send - is refused with a 403.
  it('sends the session and a bare referer', () => {
    expect(dpdImageHeaders('sessionId=abc')).toEqual({
      cookie: 'sessionId=abc',
      referer: 'https://track.dpd.co.uk/',
    })
  })
})
