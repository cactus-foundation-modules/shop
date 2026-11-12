import { describe, expect, it } from 'vitest'
import {
  palletwaysDetailsUrl,
  palletwaysRequestHeaders,
  palletwaysStatusUrl,
  parsePalletwaysDate,
  parsePalletwaysStatus,
  readPalletwaysDetails,
  readPalletwaysStatus,
} from '@/modules/shop/lib/tracking/palletways'
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
    expect(parsePalletwaysStatus(BASIC)).toEqual({ status: 'AT DELIVERY DEPOT', dueDate: '2026-10-28', dueTime: null })
  })

  it('takes the day and time off the full page form', () => {
    const full = BASIC.replace('Currently Due<', 'Currently Due By<').replace('28/10/2026<', '28/10/2026 - 16:00<')
    expect(parsePalletwaysStatus(full)).toMatchObject({ dueDate: '2026-10-28', dueTime: '16:00' })
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

// The full details as tt2.php served them on 12 November 2026 for a delivered
// pallet, trimmed to the two tables and with the customer's details taken out.
// The comments on the picture rows are as served, links and all.
const FULL = `
<table class='table table-bordered'>
  <thead><tr>
    <th><i class='clip-tag-2'></i> Palletways Tracking ID</th>
    <th><i class='clip-calendar'></i> Date Entered</th>
    <th><i class='clip-calendar'></i> Currently Due By</th>
    <th><i class='clip-pencil'></i> Consignment Number</th>
    <th><i class='clip-stack'></i> Units</th>
    <th><i class='clip-question'></i> Status</th>
  </tr></thead>
  <tbody><tr>
    <td>60051828127 <span class='text-muted text12'>(Delivery)</span></td>
    <td>10/11/2026</td>
    <td>12/11/2026 - 17:00</td>
    <td>973559</td>
    <td>1 @ 144.00kg</td>
    <td><span class='badge badge-success'>JOB COMPLETE</span></td>
  </tr></tbody>
</table>
<table class='table table-striped table-bordered table-hover table-condensed text12' id='tbl_notes'>
  <thead><tr><th>Type</th><th>Number</th><th>Barcode</th><th>Comments</th><th>Date</th><th>Time</th></tr></thead>
  <tbody>
    <tr class='text-success'>
      <td>CLEAN POD</td><td>11971</td><td></td><td>Alan @ 09:34 2026-11-12</td><td>12/11/2026</td><td>09:34</td>
    </tr>
    <tr class=''>
      <td>IMAGE SCANNED</td><td>12971</td><td></td>
      <td><img src="../show_pod.php?file=20261112093457_751_60051828127_sos_pod.tif"> <a href='../show_pod.php?fullsize=true&download=true&file=20261112093457_751_60051828127_sos_pod.tif' target='_blank' class='btn btn-primary btn-sm' id='btn_download_pod'><i class='fa fa-cloud-download'></i></a> <a href='../show_pod.php?fullsize=true&file=20261112093457_751_60051828127_sos_pod.tif' target='_blank'><i class='fa fa-external-link'></i> 20261112093457_751_60051828127_sos_pod.tif</a></td>
      <td>12/11/2026</td><td>09:34</td>
    </tr>
    <tr class=''>
      <td>POD Photo</td><td>13971</td><td></td>
      <td><img src="../show_pod.php?file=20261112093457_824_60051828127_pod_photo_1.jpg"> <a href='../show_pod.php?fullsize=true&download=true&file=20261112093457_824_60051828127_pod_photo_1.jpg' target='_blank' class='btn btn-primary btn-sm' id='btn_download_pod'><i class='fa fa-cloud-download'></i></a></td>
      <td>12/11/2026</td><td>09:34</td>
    </tr>
    <tr class=''>
      <td>ETA</td><td>9971</td><td></td>
      <td>Estimated Delivery Time: 09:24 on 12/11/2026Delivery Window: 08:24 - 10:24</td><td>12/11/2026</td><td>08:25</td>
    </tr>
    <tr class='text-muted'>
      <td>SCAN</td><td>8971</td><td>B005CD387A</td>
      <td>Scanned onto vehicle BJ24 UZL at depot 76 C&amp;D BJ24 UZL</td><td>12/11/2026</td><td>08:16</td>
    </tr>
    <tr class='text-muted'>
      <td>SCAN</td><td>7971</td><td>B005CD387A</td>
      <td>Baychecked at depot 76
B005CD387A
by user
D076-rf5</td><td>11/11/2026</td><td>22:49</td>
    </tr>
  </tbody>
</table>`

describe('readPalletwaysDetails', () => {
  const details = readPalletwaysDetails(FULL, 'Europe/London', '12:00')

  it('reads the status, and the depot\'s ETA window over the due-by time', () => {
    expect(details?.stage).toBe('JOB COMPLETE')
    expect(details?.windowFrom?.toISOString()).toBe('2026-11-12T08:24:00.000Z')
    expect(details?.windowTo?.toISOString()).toBe('2026-11-12T10:24:00.000Z')
  })

  it('takes the due-by time off the page over the setting before there is an ETA', () => {
    const early = readPalletwaysDetails(FULL.replace(/<td>ETA<\/td>/, '<td>NOTE</td>'), 'Europe/London', '12:00')
    expect(early?.windowFrom?.toISOString()).toBe('2026-11-12T00:00:00.000Z')
    expect(early?.windowTo?.toISOString()).toBe('2026-11-12T17:00:00.000Z')
  })

  it('ignores an ETA for an earlier day than the one now due', () => {
    const rebooked = readPalletwaysDetails(FULL.replace('12/11/2026 - 17:00', '13/11/2026 - 17:00'), 'Europe/London', '17:00')
    expect(rebooked?.windowFrom?.toISOString()).toBe('2026-11-13T00:00:00.000Z')
  })

  it('keeps the photograph and the signed delivery note, full size', () => {
    expect(details?.photo).toEqual({
      url: 'https://track2.palletways.com/show_pod.php?fullsize=true&file=20261112093457_824_60051828127_pod_photo_1.jpg',
      label: 'delivery-photo',
    })
    expect(details?.deliveryNote).toEqual({
      url: 'https://track2.palletways.com/show_pod.php?fullsize=true&file=20261112093457_751_60051828127_sos_pod.tif',
      label: 'delivery-note',
    })
  })

  it('names who took it in, and when', () => {
    expect(details?.receivedBy).toBe('Alan')
    expect(details?.receivedAt?.toISOString()).toBe('2026-11-12T09:34:00.000Z')
  })

  it('reads the notes as history, newest first, picture rows by their type alone', () => {
    expect(details?.events.map((e) => e.text)).toEqual([
      'CLEAN POD: Alan @ 09:34 2026-11-12',
      'IMAGE SCANNED',
      'POD Photo',
      'ETA: Estimated Delivery Time: 09:24 on 12/11/2026Delivery Window: 08:24 - 10:24',
      'SCAN: Scanned onto vehicle BJ24 UZL at depot 76 C&D BJ24 UZL',
      'SCAN: Baychecked at depot 76 B005CD387A by user D076-rf5',
    ])
    expect(details?.events[0]?.at).toBe('2026-11-12T09:34:00')
  })

  it('has no proof before there is any', () => {
    const moving = readPalletwaysDetails(FULL.replace(/<tr class='(text-success|)'>[\s\S]*?<\/tr>/g, ''), 'Europe/London', '17:00')
    expect(moving?.photo).toBeNull()
    expect(moving?.deliveryNote).toBeNull()
    expect(moving?.receivedBy).toBeNull()
    expect(moving?.events).toHaveLength(2)
  })

  it('answers nothing for their refusal page', () => {
    expect(readPalletwaysDetails('Direct access not permitted. Please consider using our API instead.', 'Europe/London', '17:00')).toBeNull()
  })

  it('asks the way their own page does', () => {
    expect(palletwaysDetailsUrl('60051828127', ' L6 6AE ')).toBe('https://track2.palletways.com/tt2.php?dc_syscon=60051828127&postcode=L6%206AE')
    expect(palletwaysRequestHeaders('60051828127')).toEqual({ referer: 'https://track2.palletways.com/index.php?dc_syscon=60051828127' })
  })
})
