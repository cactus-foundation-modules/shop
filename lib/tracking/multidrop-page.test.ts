import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import {
  dropsAwayFromCrewLine,
  parseCourierTimestamp,
  parseCrewLine,
  parseSignature,
  parseTrackingConfig,
} from '@/modules/shop/lib/tracking/multidrop-page'

const DELIVERED_PAGE = readFileSync(
  path.join(__dirname, '__fixtures__', 'multidrop-delivered.html'),
  'utf8',
)

const LONDON = 'Europe/London'

describe('parseTrackingConfig', () => {
  it('reads the ids their own map script uses', () => {
    const config = parseTrackingConfig(DELIVERED_PAGE)
    expect(config.clientId).toBe('0')
    expect(config.routeId).toBe('000000')
    expect(config.status).toBe('SD')
  })

  it('takes the destination from their pin', () => {
    // Their pin rather than our postcode: it is what the crew was given, so a
    // map drawn from it agrees with the van.
    const config = parseTrackingConfig(DELIVERED_PAGE)
    expect(config.destinationLat).toBe('51.500000')
    expect(config.destinationLng).toBe('-0.100000')
  })

  it('refuses a coordinate that is not one', () => {
    const page = 'var trackingConfig = { userLat: "51.5; DROP TABLE", userLng: "999" };'
    const config = parseTrackingConfig(page)
    expect(config.destinationLat).toBeNull()
    expect(config.destinationLng).toBeNull()
  })

  it('learns nothing from a page with no config block', () => {
    expect(parseTrackingConfig('<html></html>')).toEqual({
      clientId: null, routeId: null, status: null, destinationLat: null, destinationLng: null,
    })
  })
})

describe('parseCourierTimestamp', () => {
  it('reads their dates day first', () => {
    // 08/09/2026 is the 8th of September. Read the American way it is the 9th
    // of August, which is a month out and never complains.
    const at = parseCourierTimestamp('08/09/2026 14:23', LONDON)
    expect(at?.toISOString()).toBe('2026-09-08T13:23:00.000Z')
  })

  it('keeps the seconds where they gave them', () => {
    const at = parseCourierTimestamp('08/09/2026 14:11:44', LONDON)
    expect(at?.toISOString()).toBe('2026-09-08T13:11:44.000Z')
  })

  it('reads the wall clock in the site\'s timezone, not the server\'s', () => {
    // The same wall time in January is GMT, not BST. A server running in UTC
    // that ignored this would put every summer delivery an hour out.
    expect(parseCourierTimestamp('08/01/2026 14:23', LONDON)?.toISOString())
      .toBe('2026-01-08T14:23:00.000Z')
  })

  it('gives nothing for anything that is not one of their timestamps', () => {
    expect(parseCourierTimestamp('sometime tomorrow', LONDON)).toBeNull()
    expect(parseCourierTimestamp('32/13/2026 14:23', LONDON)).toBeNull()
    expect(parseCourierTimestamp(null, LONDON)).toBeNull()
  })
})

describe('parseCrewLine and dropsAwayFromCrewLine', () => {
  it('reads how many drops are left out of their sentence', () => {
    expect(dropsAwayFromCrewLine('The crew have 1 more drop to make before reaching you.')).toBe(1)
    expect(dropsAwayFromCrewLine('The crew have 6 more drops to make before reaching you.')).toBe(6)
  })

  it('gives nothing for a wording it does not know', () => {
    // Null is read everywhere as "not known" and never as "you are next". A
    // reworded sentence must slow the map down, not speed it up.
    expect(dropsAwayFromCrewLine('The crew are on their way to you.')).toBeNull()
    expect(dropsAwayFromCrewLine('You are drop 17 of 22')).toBeNull()
    expect(dropsAwayFromCrewLine(null)).toBeNull()
  })

  it('has no crew sentence on a page whose round has finished', () => {
    // The delivered page drops the whole crew panel. Absent has to read as
    // absent, or a customer is left with this morning's "1 more drop".
    expect(parseCrewLine(DELIVERED_PAGE)).toBeNull()
  })

  it('reads the sentence out of a page that has one', () => {
    const page = `<div id="eta-status" style="padding:10px">
        The crew have 1 more drop to make before reaching you.
      </div>`
    expect(parseCrewLine(page)).toBe('The crew have 1 more drop to make before reaching you.')
  })
})

describe('parseSignature', () => {
  it('reads the name, the time and their image', () => {
    const signature = parseSignature(DELIVERED_PAGE, LONDON)
    expect(signature?.signedBy).toBe('Sam Taylor')
    expect(signature?.signedAt?.toISOString()).toBe('2026-09-08T13:23:00.000Z')
    expect(signature?.imageUrl).toBe('https://example.invalid/image/signature_000000_0000000000000_00000.png')
  })

  it('splits the name off at the date, not at the last comma', () => {
    // 'Megan, Reception' is a name with a comma in it. Splitting on the comma
    // would file the delivery under 'Megan'.
    const page = '<div class="signature-block-container"><img src="https://x.invalid/s.png">'
      + '</div>Signed by <strong>Megan, Reception, 08/09/2026 14:23</strong>'
    expect(parseSignature(page, LONDON)?.signedBy).toBe('Megan, Reception')
  })

  it('refuses an image address that is not https', () => {
    // This URL becomes a fetch made by the site's own server.
    const page = '<div class="signature-block-container"><img src="http://x.invalid/s.png"></div>'
    expect(parseSignature(page, LONDON)?.imageUrl).toBeNull()
  })

  it('is nothing at all until the parcel has been signed for', () => {
    expect(parseSignature('<div class="card">Out for delivery</div>', LONDON)).toBeNull()
  })
})
