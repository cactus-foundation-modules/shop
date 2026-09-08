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
      outForDeliveryStages: ['Assigned to Crew'],
      deliveredStages: ['Complete'],
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
    trackingStage: null,
    trackingStageAt: null,
    trackingCheckedAt: null,
    deliveredAt: null,
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
})

const booked = (id: string, date: string, phase: 'upcoming' | 'passed'): ParcelDelivery => ({
  shipmentId: id,
  date,
  day: `day ${date}`,
  window: '',
  progress: { progress: phase === 'passed' ? 1 : 0, phase },
  outForDelivery: false,
  arrived: phase === 'passed',
  showTracking: true,
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
