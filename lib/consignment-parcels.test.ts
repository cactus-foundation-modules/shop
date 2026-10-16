import { describe, expect, it } from 'vitest'
import {
  consignmentProgressLine,
  isSplitConsignment,
  newConsignmentParcel,
  parcelCountVars,
} from '@/modules/shop/lib/consignment-parcels'
import { parseConsignmentParcels } from '@/modules/shop/lib/consignment-parcels-schema'

const box = (delivered: boolean) => ({ ...newConsignmentParcel('1*1', '1'), delivered })

describe('consignmentProgressLine', () => {
  it('words the count before, during and after', () => {
    expect(consignmentProgressLine([box(false), box(false)])).toBe('Coming in 2 parcels')
    expect(consignmentProgressLine([box(true), box(true), box(true), box(false)])).toBe('3 of 4 parcels delivered, 1 still to come')
    expect(consignmentProgressLine([box(true), box(true)])).toBe('All 2 parcels delivered')
  })
})

describe('parcelCountVars', () => {
  it('only says "several" once the courier has said so', () => {
    expect(parcelCountVars([{ consignmentParcels: null }])).toEqual({ parcelCount: '1', hasSeveralParcels: 'false' })
    expect(parcelCountVars([{ consignmentParcels: [box(false)] }])).toEqual({ parcelCount: '1', hasSeveralParcels: 'false' })
    expect(parcelCountVars([{ consignmentParcels: [box(false), box(false), box(false), box(false)] }]))
      .toEqual({ parcelCount: '4', hasSeveralParcels: 'true' })
  })
})

describe('parseConsignmentParcels', () => {
  it('reads a stored list back, and anything else as never asked', () => {
    const list = [box(true), box(false)]
    expect(parseConsignmentParcels(JSON.parse(JSON.stringify(list)))).toEqual(list)
    expect(isSplitConsignment(parseConsignmentParcels(list))).toBe(true)
    expect(parseConsignmentParcels(null)).toBeNull()
    expect(parseConsignmentParcels([{ code: 1 }])).toBeNull()
  })
})
