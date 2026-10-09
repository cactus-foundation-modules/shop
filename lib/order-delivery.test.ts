import { describe, it, expect } from 'vitest'
import { parcelDelivery, railDelivery, type ParcelDelivery } from '@/modules/shop/lib/order-delivery'
import { orderProgressSteps } from '@/modules/shop/lib/order-progress'
import type { ShpShipmentWithItems } from '@/modules/shop/lib/types'

const config = {
  deliveryCouriers: [
    {
      id: 'cou_furdeco',
      name: 'Furdeco',
      showTrackingLink: false,
      trackingSource: 'multidrop' as const,
      gfsCarrier: 'DPD',
      trackingLinkLabel: '',
      trackingLinkHint: '',
      outForDeliveryStages: ['Assigned to Crew'],
      deliveredStages: ['Complete'],
      failedStages: ['Failed Attempt'],
      rearrangeChatUrl: 'https://chat.example/rebook',
      rearrangePhone: '0121 000 0000',
      rebookedBy: 'customer' as const,
      showFailedReason: false,
      faqs: [{ id: 'f1', question: 'Q', answer: 'A' }],
    },
  ],
}

function shipment(patch: Partial<ShpShipmentWithItems>): ShpShipmentWithItems {
  return {
    id: 'shp_1',
    orderId: 'ord_1',
    shippedAt: new Date('2026-09-07T09:00:00Z'),
    trackingNumber: null,
    trackingUrl: null,
    carrier: 'Furdeco',
    courierId: 'cou_furdeco',
    deliveryDate: null,
    deliverySlotStart: null,
    deliverySlotEnd: null,
    slotNotifiedAt: null,
    trackingNotifiedAt: null,
    courierRearrangingAt: null,
    failedNotifiedAt: null,
    trackingStage: null,
    trackingStageAt: null,
    trackingCheckedAt: null,
    deliveredAt: null,
    trackingShortCode: null,
    trackingEvents: [],
    deliveryWindowFrom: null,
    deliveryWindowTo: null,
    stopNumber: null,
    stopsCompleted: null,
    stopsTotal: null,
    minutesToStop: null,
    driverName: null,
    carrierOutForDelivery: null,
    trackingClientId: null,
    trackingRouteId: null,
    crewLine: null,
    dropsAway: null,
    vehicleLat: null,
    vehicleLng: null,
    vehicleHeading: null,
    vehicleFixedAt: null,
    vehiclePolledAt: null,
    destinationLat: null,
    destinationLng: null,
    signedBy: null,
    signedAt: null,
    signatureUrl: null,
    signatureKey: null,
    notes: null,
    createdAt: new Date('2026-09-07T09:00:00Z'),
    updatedAt: new Date('2026-09-07T09:00:00Z'),
    items: [],
    ...patch,
  }
}

describe('parcelDelivery', () => {
  it('words the booked day and window, and carries the courier rules', () => {
    const delivery = parcelDelivery(
      config,
      shipment({ deliveryDate: '2026-09-08', deliverySlotStart: '10:00', deliverySlotEnd: '13:00' }),
      new Date('2026-09-07T12:00:00Z'),
      'Europe/London',
    )

    // Relative and spoken, because this is only ever rendered on request: the
    // page is built when it is read, so "tomorrow" cannot go stale on it. The
    // email uses the absolute form for exactly the opposite reason.
    expect(delivery.day).toBe('tomorrow')
    expect(delivery.window).toBe('between 10am and 1pm')
    expect(delivery.progress).toEqual({ progress: 0, phase: 'upcoming' })
    expect(delivery.showTracking).toBe(false)
    expect(delivery.faqs).toHaveLength(1)
  })

  it('says nothing about a day nobody has booked', () => {
    const delivery = parcelDelivery(config, shipment({}), new Date(), 'Europe/London')
    expect(delivery.day).toBe('')
    expect(delivery.progress).toBeNull()
  })

  it('has a window only once the courier has confirmed one', () => {
    const delivery = parcelDelivery(
      config,
      shipment({ deliveryDate: '2026-09-08' }),
      new Date('2026-09-07T12:00:00Z'),
      'Europe/London',
    )
    expect(delivery.day).toBe('tomorrow')
    expect(delivery.window).toBe('')
  })

  it('words a courier-reported window when dispatch left the slot blank', () => {
    const delivery = parcelDelivery(
      config,
      shipment({
        deliveryWindowFrom: new Date('2026-09-15T10:25:00.000Z'),
        deliveryWindowTo: new Date('2026-09-15T11:25:00.000Z'),
        carrierOutForDelivery: true,
        trackingStage: 'Your parcel will be with you today  between 11:25 and 12:25',
      }),
      new Date('2026-09-15T09:00:00.000Z'),
      'Europe/London',
    )
    expect(delivery.date).toBe('2026-09-15')
    expect(delivery.day).toBe('today')
    expect(delivery.window).toBe('between 11.25am and 12.25pm')
    expect(delivery.slotStart).toBe('11:25')
    expect(delivery.slotEnd).toBe('12:25')
  })
})

describe('an AIT parcel with the stage lists left empty', () => {
  const aitConfig = {
    deliveryCouriers: [{
      ...config.deliveryCouriers[0]!,
      id: 'cou_ait',
      name: 'AIT',
      trackingSource: 'ait' as const,
      outForDeliveryStages: [],
      deliveredStages: [],
      failedStages: [],
    }],
  }
  const late = {
    courierId: 'cou_ait',
    deliveryWindowFrom: new Date('2026-10-09T10:27:00.000Z'),
    deliveryWindowTo: new Date('2026-10-09T12:27:00.000Z'),
  }

  // The van running past the end of its two-hour window is still out, not
  // arrived: the clock must not outrank AIT's own "out for delivery".
  it('is still out for delivery after its window has passed', () => {
    const delivery = parcelDelivery(
      aitConfig,
      shipment({ ...late, carrierOutForDelivery: true, trackingStage: 'Out for delivery' }),
      new Date('2026-10-09T13:30:00.000Z'),
      'Europe/London',
    )
    expect(delivery.arrived).toBe(false)
    expect(delivery.outForDelivery).toBe(true)
  })

  it('is not arrived when cancelled, on hold or part delivered, whatever the clock says', () => {
    for (const trackingStage of ['Cancelled', 'On hold', 'Partial success']) {
      const delivery = parcelDelivery(
        aitConfig,
        shipment({ ...late, carrierOutForDelivery: false, trackingStage }),
        new Date('2026-10-09T13:30:00.000Z'),
        'Europe/London',
      )
      expect(delivery.arrived).toBe(false)
    }
  })

  // Never read from AIT - no link yet, or their feed refusing us - so there is
  // no word of theirs to wait for, and the clock decides as for any courier.
  it('falls back to the clock for a parcel AIT have never been read for', () => {
    const delivery = parcelDelivery(
      aitConfig,
      shipment({ ...late, deliveryDate: '2026-10-09', deliverySlotStart: '11:27', deliverySlotEnd: '13:27' }),
      new Date('2026-10-09T13:30:00.000Z'),
      'Europe/London',
    )
    expect(delivery.arrived).toBe(true)
  })

  it('is failed, not arrived, after an unsuccessful attempt', () => {
    const delivery = parcelDelivery(
      aitConfig,
      shipment({ ...late, carrierOutForDelivery: false, trackingStage: 'Unsuccessful - No access to property' }),
      new Date('2026-10-09T13:30:00.000Z'),
      'Europe/London',
    )
    expect(delivery.failed).toBe(true)
    expect(delivery.arrived).toBe(false)
  })
})

describe('what the courier says beats what the stage words say', () => {
  // DPD write to the customer - "Your parcel will be with you today between
  // 11:41 and 12:41" - which no settings box could ever match. Their flag can.
  it('is out for delivery on the courier flag alone', () => {
    const delivery = parcelDelivery(
      config,
      shipment({
        deliveryDate: '2026-09-10',
        trackingStage: 'Your parcel will be with you today between 11:41 and 12:41',
        carrierOutForDelivery: true,
      }),
      new Date('2026-09-10T09:00:00Z'),
      'Europe/London',
    )
    expect(delivery.outForDelivery).toBe(true)
  })

  // Null is "they do not report it", not "no" - so the stage settings still
  // decide on every courier that only ever gives words.
  it('falls back to the stage words when the courier reports nothing', () => {
    const delivery = parcelDelivery(
      config,
      shipment({ deliveryDate: '2026-09-10', trackingStage: 'Assigned to Crew', carrierOutForDelivery: null }),
      new Date('2026-09-10T09:00:00Z'),
      'Europe/London',
    )
    expect(delivery.outForDelivery).toBe(true)
  })

  it('believes a courier who says it is NOT out yet', () => {
    const delivery = parcelDelivery(
      config,
      shipment({ deliveryDate: '2026-09-10', trackingStage: 'Assigned to Crew', carrierOutForDelivery: false }),
      new Date('2026-09-10T09:00:00Z'),
      'Europe/London',
    )
    expect(delivery.outForDelivery).toBe(false)
  })

  it('treats a received-by name alone as arrived', () => {
    const delivery = parcelDelivery(
      config,
      shipment({
        carrierOutForDelivery: true,
        signedBy: 'Patel',
        trackingStage: 'Your parcel has been delivered and received by PATEL',
      }),
      new Date('2026-09-15T12:00:00.000Z'),
      'Europe/London',
    )
    expect(delivery.arrived).toBe(true)
    expect(delivery.outForDelivery).toBe(false)
    expect(delivery.live.round).toBe('')
  })

  it('stops saying out for delivery once the courier has delivered', () => {
    const delivery = parcelDelivery(
      config,
      shipment({
        deliveryDate: '2026-09-10',
        trackingStage: 'Your parcel has been delivered and received by PATEL',
        carrierOutForDelivery: true,
        deliveredAt: new Date('2026-09-10T11:53:00Z'),
        minutesToStop: 2,
        stopNumber: 24,
        stopsCompleted: 24,
        trackingCheckedAt: new Date('2026-09-10T11:00:00Z'),
      }),
      new Date('2026-09-10T12:00:00Z'),
      'Europe/London',
    )
    expect(delivery.arrived).toBe(true)
    expect(delivery.outForDelivery).toBe(false)
    expect(delivery.live.yours).toBe('')
  })
})

const booked = (id: string, date: string, phase: 'upcoming' | 'passed'): ParcelDelivery => ({
  shipmentId: id,
  date,
  day: `day ${date}`,
  window: '',
  slotStart: null,
  slotEnd: null,
  progress: { progress: phase === 'passed' ? 1 : 0, phase },
  outForDelivery: false,
  arrived: phase === 'passed',
  failed: false,
  rearrange: null,
  delay: null,
  showTracking: true,
  trackingLabel: 'Track your parcel',
  trackingHint: '',
  live: { round: '', yours: '', fraction: null },
  events: [],
  faqs: [],
})

describe('railDelivery', () => {
  it('shows the soonest delivery still to come, not the last one', () => {
    // Two parcels: Friday finishes the order, Tuesday is the one somebody has
    // to be in for. Showing Friday would have them out when the van came.
    const picked = railDelivery([booked('a', '2026-09-11', 'upcoming'), booked('b', '2026-09-08', 'upcoming')])
    expect(picked?.shipmentId).toBe('b')
  })

  it('ignores deliveries that have already been', () => {
    const picked = railDelivery([booked('a', '2026-09-08', 'passed'), booked('b', '2026-09-11', 'upcoming')])
    expect(picked?.shipmentId).toBe('b')
  })

  it('falls back to the most recent once every delivery has been', () => {
    const picked = railDelivery([booked('a', '2026-09-08', 'passed'), booked('b', '2026-09-11', 'passed')])
    expect(picked?.shipmentId).toBe('b')
  })

  it('is nothing when no delivery is booked', () => {
    expect(railDelivery([])).toBeNull()
    expect(railDelivery([{ ...booked('a', '', 'upcoming'), date: '', day: '', progress: null }])).toBeNull()
  })

  it('includes a parcel that has arrived even with no booked day', () => {
    const picked = railDelivery([{
      ...booked('a', '', 'passed'),
      date: '',
      day: '',
      progress: null,
      arrived: true,
    }])
    expect(picked?.shipmentId).toBe('a')
  })
})

describe('orderProgressSteps with a delivery', () => {
  const order = {
    status: 'SHIPPED' as const,
    paymentStatus: 'PAID' as const,
    paidAt: new Date('2026-09-04T10:00:00Z'),
    createdAt: new Date('2026-09-04T09:00:00Z'),
  }
  const lines = [{ item: { quantity: 1 }, dispatchedQty: 1 }]

  it('is the same four steps when nothing is booked', () => {
    const steps = orderProgressSteps({ order, lines, lastShippedAt: new Date('2026-09-06T09:00:00Z') })
    expect(steps.map((s) => s.key)).toEqual(['placed', 'paid', 'dispatched', 'complete'])
  })

  it('slots the van in between dispatched and complete', () => {
    const steps = orderProgressSteps({
      order,
      lines,
      lastShippedAt: new Date('2026-09-06T09:00:00Z'),
      delivery: { day: 'Tuesday 8th of September', window: 'between 10:00 and 13:00', progress: 0.5, underway: true, arrived: false },
    })

    expect(steps.map((s) => s.key)).toEqual(['placed', 'paid', 'dispatched', 'delivery', 'complete'])
    const van = steps.find((s) => s.key === 'delivery')
    expect(van?.state).toBe('now')
    expect(van?.label).toBe('Out for delivery')
    expect(van?.note).toBe('Tuesday 8th of September between 10:00 and 13:00')
    expect(van?.progress).toBe(0.5)
  })

  it('says the delivery is scheduled until the window actually opens', () => {
    // The complaint this answers: a parcel booked for tomorrow is not "out for
    // delivery", and saying so has somebody waiting in a day early.
    const steps = orderProgressSteps({
      order,
      lines,
      lastShippedAt: new Date('2026-09-06T09:00:00Z'),
      delivery: { day: 'tomorrow', window: 'between 10am and 1pm', progress: 0, underway: false, arrived: false },
    })

    expect(steps.find((s) => s.key === 'delivery')?.label).toBe('Delivery scheduled')
    // Capitalised for the rail even though the day arrives lower case, so it
    // can also sit inside "Arranged for tomorrow" on the parcel card.
    expect(steps.find((s) => s.key === 'delivery')?.note).toBe('Tomorrow between 10am and 1pm')
  })

  it('says the day it came once the courier has said so', () => {
    // The defect this answers, seen on a real order: a delivered parcel's rail
    // still read "Today between 10am and 1pm" under a ticked step - a plan
    // presented as a record, and one that would have said "Today" the following
    // morning too.
    const steps = orderProgressSteps({
      order,
      lines,
      lastShippedAt: new Date('2026-09-06T09:00:00Z'),
      delivery: {
        day: 'today',
        window: 'between 10am and 1pm',
        progress: 1,
        underway: false,
        arrived: true,
        deliveredOn: 'today',
      },
    })

    const step = steps.find((s) => s.key === 'delivery')
    // The step keeps its neutral name; the note carries the news. 'Delivered'
    // above 'Delivered today' would be the same word twice.
    expect(step?.label).toBe('Delivery')
    expect(step?.note).toBe('Delivered today')
  })

  it('will not call it delivered on the strength of the clock alone', () => {
    // `arrived` with no date behind it means only that the booked window has
    // gone by. That is not the courier saying it turned up, so the step keeps
    // the arrangement on show rather than inventing a delivery date.
    const steps = orderProgressSteps({
      order,
      lines,
      lastShippedAt: new Date('2026-09-06T09:00:00Z'),
      delivery: { day: 'today', window: 'between 10am and 1pm', progress: 1, underway: false, arrived: true },
    })

    const step = steps.find((s) => s.key === 'delivery')
    expect(step?.label).toBe('Delivery')
    expect(step?.note).toBe('Today between 10am and 1pm')
  })

  it('does not tick Complete off a clock', () => {
    // The window passing means the van has been, which is not the same as the
    // order being finished - a delivery can fail.
    const steps = orderProgressSteps({
      order,
      lines,
      lastShippedAt: new Date('2026-09-06T09:00:00Z'),
      delivery: { day: 'Tuesday 8th of September', window: 'between 10:00 and 13:00', progress: 1, underway: false, arrived: true },
    })

    expect(steps.find((s) => s.key === 'delivery')?.state).toBe('done')
    expect(steps.find((s) => s.key === 'complete')?.state).toBe('now')
  })
})

describe('a failed delivery', () => {
  const failedParcel = (patch: Partial<ShpShipmentWithItems> = {}) => shipment({
    deliveryDate: '2026-09-25',
    deliverySlotStart: '09:00',
    deliverySlotEnd: '12:00',
    trackingNumber: 'F52483705654',
    trackingStage: 'Failed Attempt - Non Fault - RECIPIENT NOT HOME - UNABLE TO DELIVER',
    ...patch,
  })

  it('is neither out for delivery nor arrived, even once the window has gone', () => {
    // 3pm, the window long closed. Without the failure the clock fallback
    // would call this arrived.
    const delivery = parcelDelivery(config, failedParcel(), new Date('2026-09-25T14:00:00Z'), 'Europe/London')
    expect(delivery.failed).toBe(true)
    expect(delivery.arrived).toBe(false)
    expect(delivery.outForDelivery).toBe(false)
    expect(delivery.rearrange).toEqual({
      courierName: 'Furdeco',
      chatUrl: 'https://chat.example/rebook',
      phone: '0121 000 0000',
      courierWillContact: false,
      reason: '',
    })
  })

  it('tells the customer to wait when the courier always rebooks, keeping the contact details', () => {
    const courierRebooks = { deliveryCouriers: [{ ...config.deliveryCouriers[0]!, rebookedBy: 'courier' as const }] }
    const delivery = parcelDelivery(courierRebooks, failedParcel(), new Date('2026-09-25T11:30:00Z'), 'Europe/London')
    expect(delivery.rearrange).toMatchObject({
      courierWillContact: true,
      chatUrl: 'https://chat.example/rebook',
      phone: '0121 000 0000',
    })
  })

  it('gives the courier\'s reason only where the courier is set to show it', () => {
    const showing = { deliveryCouriers: [{ ...config.deliveryCouriers[0]!, showFailedReason: true }] }
    const delivery = parcelDelivery(showing, failedParcel(), new Date('2026-09-25T11:30:00Z'), 'Europe/London')
    expect(delivery.rearrange?.reason).toBe('Recipient not home - unable to deliver')
  })

  it('tells the customer to wait once staff say the courier will call', () => {
    const delivery = parcelDelivery(
      config,
      failedParcel({ courierRearrangingAt: new Date('2026-09-25T11:00:00Z') }),
      new Date('2026-09-25T11:30:00Z'),
      'Europe/London',
    )
    expect(delivery.rearrange?.courierWillContact).toBe(true)
  })

  it('gives way to a real delivery timestamp', () => {
    const delivery = parcelDelivery(
      config,
      failedParcel({ deliveredAt: new Date('2026-09-29T10:00:00Z') }),
      new Date('2026-09-29T11:00:00Z'),
      'Europe/London',
    )
    expect(delivery.failed).toBe(false)
    expect(delivery.rearrange).toBeNull()
    expect(delivery.arrived).toBe(true)
  })

  it('puts the rail step at "Delivery not possible" with no date under it', () => {
    const delivery = parcelDelivery(config, failedParcel(), new Date('2026-09-25T10:30:00Z'), 'Europe/London')
    const steps = orderProgressSteps({
      order: { status: 'SHIPPED', paymentStatus: 'PAID', paidAt: new Date('2026-09-20T10:00:00Z'), createdAt: new Date('2026-09-20T10:00:00Z') },
      lines: [{ item: { quantity: 1 }, dispatchedQty: 1 }],
      lastShippedAt: new Date('2026-09-24T16:57:00Z'),
      delivery: {
        day: delivery.day,
        window: delivery.window,
        progress: delivery.progress?.progress ?? 0,
        underway: false,
        arrived: delivery.arrived,
        failed: delivery.failed,
      },
    })
    const step = steps.find((s) => s.key === 'delivery')
    expect(step?.label).toBe('Delivery not possible')
    expect(step?.state).toBe('now')
    expect(step?.note).toBe('A new day is needed')
  })
})

describe('parcelDelivery with a reported delay', () => {
  const now = new Date('2026-09-10T14:00:00Z')

  it('keeps the day while running late, and puts the delay on the rail', () => {
    const delivery = parcelDelivery(config, shipment({
      deliveryDate: '2026-09-10', deliverySlotStart: '10:00', deliverySlotEnd: '13:00',
      deliveryDelay: 'today', deliveryDelayedFrom: '2026-09-10', deliveryDelayedAt: now,
      deliveryDelayNote: '  Van  broke down. ',
    }), now, 'Europe/London')
    expect(delivery.delay).toEqual({ kind: 'today', note: 'Van broke down.' })
    expect(delivery.day).toBe('today')
    const steps = orderProgressSteps({
      order: { status: 'SHIPPED', paymentStatus: 'PAID', paidAt: now, createdAt: now },
      lines: [{ item: { quantity: 1 }, dispatchedQty: 1 }],
      lastShippedAt: now,
      delivery: { day: delivery.day, window: delivery.window, progress: 1, underway: false, arrived: false, delay: 'today' },
    })
    expect(steps.find((s) => s.key === 'delivery')?.label).toBe('Running late')
  })

  it('drops the missed day while a new one is awaited, and still shows on the rail', () => {
    const delivery = parcelDelivery(config, shipment({
      deliveryDate: '2026-09-09', deliveryDelay: 'today', deliveryDelayedFrom: '2026-09-09', deliveryDelayedAt: now,
    }), now, 'Europe/London')
    expect(delivery.delay?.kind).toBe('rebooking')
    expect(delivery.day).toBe('')
    expect(delivery.progress).toBeNull()
    expect(railDelivery([delivery])?.shipmentId).toBe('shp_1')
  })
})

describe('parcelDelivery with a reported delay, after the window', () => {
  it('does not count a running-late parcel as arrived because its window has passed', () => {
    const now = new Date('2026-09-10T14:30:00Z')
    const delivery = parcelDelivery(config, shipment({
      deliveryDate: '2026-09-10', deliverySlotStart: '10:00', deliverySlotEnd: '13:00',
      deliveryDelay: 'today', deliveryDelayedFrom: '2026-09-10', deliveryDelayedAt: new Date('2026-09-10T11:30:00Z'),
    }), now, 'Europe/London')
    expect(delivery.arrived).toBe(false)
    expect(delivery.delay?.kind).toBe('today')
  })

  it('puts a parcel coming tomorrow on the rail ahead of one waiting on a new day', () => {
    const waiting = { ...booked('a', '', 'upcoming'), progress: null, day: '', delay: { kind: 'rebooking' as const, note: '' } }
    const tomorrow = booked('b', '2026-09-11', 'upcoming')
    expect(railDelivery([waiting, tomorrow])?.shipmentId).toBe('b')
    expect(railDelivery([waiting])?.shipmentId).toBe('a')
  })
})
