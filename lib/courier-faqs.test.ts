import { describe, it, expect } from 'vitest'
import {
  courierFaqUrl,
  courierForShipment,
  customerMaySeeTracking,
  faqsForShipment,
} from '@/modules/shop/lib/courier-faqs'

const FURDECO = {
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
  faqs: [{ id: 'faq_1', question: 'Will they take it upstairs?', answer: 'No.' }],
}
const DPD = {
  id: 'cou_dpd',
  name: 'DPD',
  showTrackingLink: true,
  trackingSource: 'none' as const,
  gfsCarrier: 'DPD',
  trackingLinkLabel: '',
  trackingLinkHint: '',
  outForDeliveryStages: [],
  deliveredStages: [],
  failedStages: [],
  rearrangeChatUrl: '',
  rearrangePhone: '',
  faqs: [],
}
const config = { deliveryCouriers: [FURDECO, DPD] }

const parcel = (courierId: string | null, carrier: string | null) => ({ courierId, carrier })

describe('courierForShipment', () => {
  it('matches on the id dispatch recorded', () => {
    expect(courierForShipment(config, parcel('cou_furdeco', 'Furdeco'))?.id).toBe('cou_furdeco')
  })

  it('falls back to the name, which is all an older parcel has', () => {
    // Every parcel dispatched before couriers were a list has a typed-in name
    // and no id. Matching those is what makes adding a courier today apply to
    // the deliveries already in flight.
    expect(courierForShipment(config, parcel(null, 'furdeco '))?.id).toBe('cou_furdeco')
  })

  it('is nothing for a carrier nobody configured', () => {
    expect(courierForShipment(config, parcel(null, 'Bob with a van'))).toBeNull()
    expect(courierForShipment(config, parcel(null, null))).toBeNull()
  })

  it('prefers the id over a name that says otherwise', () => {
    expect(courierForShipment(config, parcel('cou_dpd', 'Furdeco'))?.id).toBe('cou_dpd')
  })
})

describe('customerMaySeeTracking', () => {
  it('honours the courier that says no', () => {
    expect(customerMaySeeTracking(config, parcel('cou_furdeco', 'Furdeco'))).toBe(false)
  })

  it('shows it for a courier that says yes', () => {
    expect(customerMaySeeTracking(config, parcel('cou_dpd', 'DPD'))).toBe(true)
  })

  it('shows it for an unconfigured carrier, which is how the shop always behaved', () => {
    expect(customerMaySeeTracking(config, parcel(null, 'Bob with a van'))).toBe(true)
  })
})

describe('faqsForShipment', () => {
  it('gives the courier its own questions', () => {
    expect(faqsForShipment(config, parcel('cou_furdeco', 'Furdeco'))).toHaveLength(1)
  })

  it('gives nothing at all where there are none', () => {
    expect(faqsForShipment(config, parcel('cou_dpd', 'DPD'))).toEqual([])
    expect(faqsForShipment(config, parcel(null, 'Bob with a van'))).toEqual([])
  })
})

describe('courierFaqUrl', () => {
  it('adds the query to a plain order link', () => {
    expect(courierFaqUrl('https://shop.example/shop/track-order/DW1')).toBe(
      'https://shop.example/shop/track-order/DW1?faq=1',
    )
  })

  it('keeps the token a guest link already carries', () => {
    // The bug this guards: pasting "?faq=1" onto a url that already has a query
    // makes an address that opens nothing and proves nothing.
    const url = courierFaqUrl('https://shop.example/shop/track-order/DW1?t=abc123')
    expect(url).toContain('t=abc123')
    expect(url).toContain('faq=1')
  })

  it('is empty for a shop with no order link to send anybody to', () => {
    expect(courierFaqUrl('')).toBe('')
    expect(courierFaqUrl('not a url')).toBe('')
  })
})
