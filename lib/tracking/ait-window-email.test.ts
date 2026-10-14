import { describe, expect, it } from 'vitest'
import { addressEndsWithPostcode, isAitSender, readAitWindowEmail } from './ait-window-email'

// AIT's own emails, as the inbox stores them (order DW000219, October 2026).

const WINDOW_EMAIL = `AIT Home Delivery [https://portal.aithomedelivery.co.uk/img/alert-emails/ait-small.png]
--------------------------------------------------------------------------------
Your DESKWELL LTD (PRO-FORMA) delivery on 14/10/2026 is expected between 08:06-10:06
--------------------------------------------------------------------------------
Please ensure that someone will be available to sign for your delivery at this address
1-7 Whittington Avenue , 1 Whittington Avenue , London , EC3V 1LP
Please prepare for your delivery by watching the below video`

const BOOKED_EMAIL = `AIT Home Delivery
--------------------------------------------------------------------------------
Your DESKWELL LTD (PRO-FORMA) delivery is booked for: 14/10/2026
--------------------------------------------------------------------------------
Good News! Your delivery has been booked. We will send another message the day before with an estimated time window for your delivery.`

describe('readAitWindowEmail', () => {
  it('reads the day, the window and the address', () => {
    expect(readAitWindowEmail(WINDOW_EMAIL)).toEqual({
      date: '2026-10-14',
      slotStart: '08:06',
      slotEnd: '10:06',
      address: '1-7 Whittington Avenue , 1 Whittington Avenue , London , EC3V 1LP',
    })
  })

  it('ignores the "booked for" email, which has a day and no time', () => {
    expect(readAitWindowEmail(BOOKED_EMAIL)).toBeNull()
  })

  it('refuses a window that ends before it starts, or a day that is not one', () => {
    expect(readAitWindowEmail('delivery on 14/10/2026 is expected between 10:06-08:06')).toBeNull()
    expect(readAitWindowEmail('delivery on 31/02/2026 is expected between 08:06-10:06')).toBeNull()
  })

  it('pads single-digit hours', () => {
    expect(readAitWindowEmail('delivery on 4/1/2027 is expected between 8:06-10:06')).toMatchObject({
      date: '2027-01-04', slotStart: '08:06', slotEnd: '10:06', address: '',
    })
  })
})

describe('isAitSender', () => {
  it('knows their own domains and nobody else', () => {
    expect(isAitSender('tracker@aithomedelivery.com')).toBe(true)
    expect(isAitSender('bookings.AITHD@aitworldwide.com')).toBe(true)
    expect(isAitSender('purchasing@deskwell.co.uk')).toBe(false)
    expect(isAitSender('tracker@notaithomedelivery.com')).toBe(false)
  })
})

describe('addressEndsWithPostcode', () => {
  const address = '1-7 Whittington Avenue , 1 Whittington Avenue , London , EC3V 1LP'
  it('matches the postcode at the end however it is spaced', () => {
    expect(addressEndsWithPostcode(address, 'ec3v1lp')).toBe(true)
    expect(addressEndsWithPostcode(address, 'EC3V 1LP')).toBe(true)
  })
  it('does not match another postcode, or a blank one', () => {
    expect(addressEndsWithPostcode(address, 'EC3V 1LQ')).toBe(false)
    expect(addressEndsWithPostcode(address, '')).toBe(false)
  })
})
