import { describe, it, expect } from 'vitest'
import { dispatchDetails } from '@/modules/shop/lib/order-status'

describe('dispatchDetails', () => {
  it('quotes the number and the courier of a single parcel', () => {
    expect(dispatchDetails([{ trackingNumber: 'AB123', carrier: 'DPD' }]))
      .toEqual({ trackingNumber: 'AB123', carrier: 'DPD' })
  })

  // The customer being told the whole order is on its way wants every number,
  // not whichever parcel happened to be recorded first.
  it('joins every parcel that has one', () => {
    expect(dispatchDetails([
      { trackingNumber: 'AB123', carrier: 'DPD' },
      { trackingNumber: 'CD456', carrier: 'DPD' },
    ])).toEqual({ trackingNumber: 'AB123, CD456', carrier: 'DPD' })
  })

  it('ignores parcels with nothing recorded against them', () => {
    expect(dispatchDetails([
      { trackingNumber: null, carrier: null },
      { trackingNumber: '  ', carrier: 'Royal Mail' },
      { trackingNumber: 'AB123', carrier: null },
    ])).toEqual({ trackingNumber: 'AB123', carrier: 'Royal Mail' })
  })

  // Empty strings, so the template's {{#if}} drops the line rather than
  // printing "Tracking number:" and then nothing.
  it('gives back empty strings when nothing was recorded at all', () => {
    expect(dispatchDetails([{ trackingNumber: null, carrier: null }]))
      .toEqual({ trackingNumber: '', carrier: '' })
    expect(dispatchDetails([])).toEqual({ trackingNumber: '', carrier: '' })
  })
})
