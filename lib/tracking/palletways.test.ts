import { describe, expect, it } from 'vitest'
import { palletwaysStatusUrl, parsePalletwaysDate, parsePalletwaysStatus, readPalletwaysStatus } from '@/modules/shop/lib/tracking/palletways'
import { openablePalletwaysLink, palletwaysTrackingId, palletwaysTrackingLink } from '@/modules/shop/lib/tracking/palletways-link'

// Their status table as tt_basic.php served it on 27 October 2026 for order
// DW000246, trimmed to the table.
const BASIC = `
<h4>Consignment Status</h4>
<table class='table table-condensed table-bordered'>
  <thead><tr>
    <th><i class='clip-tag-2'></i> Palletways Tracking ID</th>
    <th><i class='clip-calendar'></i> Currently Due</th>
    <th><i class='clip-pencil'></i> Consignment Number</th>
    <th><i class='clip-stack'></i> Units</th>
    <th><i class='clip-question'></i> Status</th>
  </tr></thead>
  <tbody><tr>
    <td>60051423573 <span class='text-muted text12'>(Delivery)</span></td>
    <td>28/10/2026</td>
    <td>974668</td>
    <td>5 @ 1528.00kg</td>
    <td><span class='badge badge-info'>AT DELIVERY DEPOT</span></td>
  </tr></tbody>
</table>`

describe('palletwaysTrackingId', () => {
  it('reads the ID out of either of their links, or bare', () => {
    expect(palletwaysTrackingId('https://track2.palletways.com/index.php?dc_syscon=60051423573')).toBe('60051423573')
    expect(palletwaysTrackingId('https://track2.palletways.com/tt2.php?dc_syscon=60051423573&postcode=LL11%201BS')).toBe('60051423573')
    expect(palletwaysTrackingId(' 60051423573 ')).toBe('60051423573')
  })

  it('refuses anything that is not theirs or not eleven digits', () => {
    expect(palletwaysTrackingId('https://example.com/?dc_syscon=60051423573')).toBeNull()
    expect(palletwaysTrackingId('6005142357')).toBeNull()
    expect(palletwaysTrackingId('')).toBeNull()
  })
})

describe('openablePalletwaysLink', () => {
  it('turns the full-details link into the public page, dropping the postcode', () => {
    expect(openablePalletwaysLink('https://track2.palletways.com/tt2.php?dc_syscon=60051423573&postcode=LL11%201BS'))
      .toBe(palletwaysTrackingLink('60051423573'))
  })

  it('leaves every other link alone', () => {
    const index = 'https://track2.palletways.com/index.php?dc_syscon=60051423573'
    expect(openablePalletwaysLink(index)).toBe(index)
    expect(openablePalletwaysLink('https://track.dpd.co.uk/parcels/1')).toBe('https://track.dpd.co.uk/parcels/1')
  })
})

describe('parsePalletwaysStatus', () => {
  it('finds the status and due day by header name', () => {
    expect(parsePalletwaysStatus(BASIC)).toEqual({ status: 'AT DELIVERY DEPOT', dueDate: '2026-10-28' })
  })

  it('takes the day off the full page form, which has a time after it', () => {
    const full = BASIC.replace('Currently Due<', 'Currently Due By<').replace('28/10/2026<', '28/10/2026 - 17:00<')
    expect(parsePalletwaysStatus(full)?.dueDate).toBe('2026-10-28')
  })

  it('answers nothing for their refusal page', () => {
    expect(parsePalletwaysStatus('Direct access not permitted. Please consider using our API instead.')).toBeNull()
  })

  it('reads the date day first and refuses nonsense', () => {
    expect(parsePalletwaysDate('3/11/2026')).toBe('2026-11-03')
    expect(parsePalletwaysDate('32/10/2026')).toBeNull()
  })
})

describe('readPalletwaysStatus', () => {
  it('makes the due day a window ending at the due-by time', () => {
    const reading = readPalletwaysStatus(BASIC, 'Europe/London', '17:00')
    expect(reading.stage).toBe('AT DELIVERY DEPOT')
    expect(reading.windowFrom?.toISOString()).toBe('2026-10-28T00:00:00.000Z')
    expect(reading.windowTo?.toISOString()).toBe('2026-10-28T17:00:00.000Z')
  })

  it('gives the whole day when no time is set', () => {
    expect(readPalletwaysStatus(BASIC, 'Europe/London', '').windowTo?.toISOString()).toBe('2026-10-28T23:59:00.000Z')
  })

  it('asks the open status page', () => {
    expect(palletwaysStatusUrl('60051423573')).toBe('https://track2.palletways.com/tt_basic.php?dc_syscon=60051423573')
  })
})
