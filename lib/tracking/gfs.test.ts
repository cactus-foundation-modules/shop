import { describe, expect, it } from 'vitest'
import {
  gfsParcelNumberFromUrl,
  gfsScanUrl,
  parseGfsEtaWindow,
  parseGfsScanDate,
  parseGfsScans,
  readGfsPage,
} from '@/modules/shop/lib/tracking/gfs'

// Their real page, trimmed to the table. Captured 10 September 2026 from the
// parcel this reader was written against - a page nobody controls is worth
// testing against what it actually said rather than against a tidy invention.
const PAGE = `
<html><body>
<h2>Parcel details</h2>
<p>Parcel number: 15505217095248</p>
<table>
  <tr><th>Date</th><th>Location</th><th>Scan text</th></tr>
  <tr><td>10/9/2026 09:41</td><td>PRESTON</td><td>OUT FOR DELIVERY, ETA: 11:41 - 12:41</td></tr>
  <tr><td>10/9/2026 08:36</td><td>PRESTON</td><td>YOUR PARCEL HAS ARRIVED AT THE DELIVERY DEPOT</td></tr>
  <tr><td>10/9/2026 02:31</td><td>HUB 5 - HINCKLEY</td><td>ARRIVED AT HUB</td></tr>
  <tr><td>9/9/2026 19:01</td><td>HINCKLEY</td><td>PARCEL DATA RECEIVED - AWAITING CARRIER SCAN</td></tr>
</table>
</body></html>
`

describe('gfsScanUrl', () => {
  it('asks with the three parameters that are actually the key', () => {
    const url = gfsScanUrl('15505217095248', 'DPD')
    expect(url).toContain('ConsNumber=15505217095248')
    expect(url).toContain('ParcelNumber=15505217095248')
    expect(url).toContain('Carrier=DPD')
  })

  // The links suppliers send also carry their own GFS account number. It makes
  // no difference to the answer, and a shop should never need a supplier's
  // account number to find out where its own parcel is.
  it('needs no customer id', () => {
    expect(gfsScanUrl('15505217095248', 'DPD')).not.toContain('custid')
  })
})

describe('gfsParcelNumberFromUrl', () => {
  it('takes the parcel number out of a DPD link, star and all', () => {
    expect(gfsParcelNumberFromUrl('https://track.dpd.co.uk/parcels/15505217095248*21437'))
      .toBe('15505217095248')
  })

  it('is null for a link with no number in it', () => {
    expect(gfsParcelNumberFromUrl('https://example.com/tracking')).toBeNull()
    expect(gfsParcelNumberFromUrl(null)).toBeNull()
  })
})

describe('parseGfsScanDate', () => {
  // The reason this function exists: their dates are day-first, and the
  // built-in parser reads 10/9/2026 as the 9th of October.
  it('reads their day-first dates as days', () => {
    expect(parseGfsScanDate('10/9/2026 09:41')).toBe('2026-09-10T09:41:00')
    expect(parseGfsScanDate('9/9/2026 19:01')).toBe('2026-09-09T19:01:00')
  })

  it('refuses anything that is not one of their dates', () => {
    expect(parseGfsScanDate('Date')).toBeNull()
    expect(parseGfsScanDate('2026-09-10 09:41')).toBeNull()
    // A page that changed shape, not a date - and it must not roll over into
    // the following month.
    expect(parseGfsScanDate('32/9/2026 09:41')).toBeNull()
    expect(parseGfsScanDate('10/13/2026 09:41')).toBeNull()
  })
})

describe('parseGfsScans', () => {
  it('reads every scan, newest first', () => {
    const scans = parseGfsScans(PAGE)
    expect(scans).toHaveLength(4)
    expect(scans[0]).toEqual({
      at: '2026-09-10T09:41:00',
      location: 'PRESTON',
      text: 'OUT FOR DELIVERY, ETA: 11:41 - 12:41',
    })
    expect(scans[3]?.location).toBe('HINCKLEY')
  })

  // Dropped by failing to be a date rather than by matching its words, so a
  // reworded header stops being recognised instead of starting to be a scan.
  it('drops the header row', () => {
    expect(parseGfsScans(PAGE).some((s) => s.text === 'Scan text')).toBe(false)
  })

  it('reads nothing out of a page that is not theirs', () => {
    expect(parseGfsScans('<html><body>Sorry, we could not find that.</body></html>')).toEqual([])
  })
})

describe('parseGfsEtaWindow', () => {
  it('takes the window off the out-for-delivery scan, on that scan own day', () => {
    const window = parseGfsEtaWindow({
      at: '2026-09-10T09:41:00',
      location: 'PRESTON',
      text: 'OUT FOR DELIVERY, ETA: 11:41 - 12:41',
    })
    expect(window?.from.getHours()).toBe(11)
    expect(window?.from.getMinutes()).toBe(41)
    expect(window?.to.getHours()).toBe(12)
  })

  it('is null on a scan with no window in it', () => {
    expect(parseGfsEtaWindow({ at: '2026-09-10T02:31:00', location: 'HUB', text: 'ARRIVED AT HUB' }))
      .toBeNull()
  })
})

describe('readGfsPage', () => {
  it('reports the newest scan as the stage, in their words', () => {
    const reading = readGfsPage(PAGE)
    expect(reading.stage).toBe('OUT FOR DELIVERY, ETA: 11:41 - 12:41')
    expect(reading.events).toHaveLength(4)
    expect(reading.windowFrom).not.toBeNull()
  })

  // Nothing learned is not the same as nothing happening, and the caller tells
  // them apart by the stage being null.
  it('learns nothing from a page it cannot read', () => {
    expect(readGfsPage('<html><body>503</body></html>').stage).toBeNull()
  })
})
