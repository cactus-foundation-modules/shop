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
    })
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
