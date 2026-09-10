import { describe, expect, it } from 'vitest'
import { liveProgress, spokenMinutes } from '@/modules/shop/lib/tracking/live-line'

const NOW = new Date('2026-09-10T11:00:00Z')

describe('spokenMinutes', () => {
  it('is precise where precision matters and vague where it does not', () => {
    expect(spokenMinutes(0)).toBe('any minute now')
    expect(spokenMinutes(2)).toBe('any minute now')
    expect(spokenMinutes(8)).toBe('about 8 minutes away')
    expect(spokenMinutes(60)).toBe('about an hour away')
    expect(spokenMinutes(90)).toBe('about an hour and a half away')
    expect(spokenMinutes(150)).toBe('about 2 and a half hours away')
    expect(spokenMinutes(230)).toBe('about 4 hours away')
  })
})

describe('liveProgress', () => {
  const base = {
    driverName: 'Mozam',
    stopNumber: 34,
    stopsCompleted: 9,
    stopsTotal: 98,
    minutesToStop: 90,
    checkedAt: NOW,
    now: NOW,
  }

  it('says what the courier said', () => {
    const p = liveProgress(base)
    expect(p.round).toBe('Mozam is on drop 9 of 98.')
    expect(p.yours).toBe('You are drop 34, about an hour and a half away.')
    expect(p.fraction).toBeCloseTo(9 / 98)
  })

  // The estimate was true when it was read, and it is read on a schedule. An
  // hour later it is an hour less, or somebody is told at half twelve that
  // their parcel was ninety minutes away at eleven.
  it('takes off the time since it was read', () => {
    const p = liveProgress({ ...base, now: new Date('2026-09-10T12:00:00Z') })
    expect(p.yours).toBe('You are drop 34, about 30 minutes away.')
  })

  it('stops claiming anything rather than counting backwards', () => {
    const p = liveProgress({ ...base, now: new Date('2026-09-10T14:00:00Z') })
    expect(p.yours).toBe('You are drop 34, any minute now.')
  })

  it('drops the half it was not told rather than guessing it', () => {
    expect(liveProgress({ ...base, stopsCompleted: null, stopsTotal: null }).round).toBe('')
    expect(liveProgress({ ...base, stopNumber: null }).yours).toBe('Your parcel is about an hour and a half away.')
    expect(liveProgress({ ...base, minutesToStop: null }).yours).toBe('You are drop 34.')
  })

  it('manages without a driver name', () => {
    expect(liveProgress({ ...base, driverName: null }).round).toBe('Your driver is on drop 9 of 98.')
  })

  it('says nothing at all when the courier said nothing', () => {
    const p = liveProgress({
      driverName: null, stopNumber: null, stopsCompleted: null,
      stopsTotal: null, minutesToStop: null, checkedAt: null, now: NOW,
    })
    expect(p).toEqual({ round: '', yours: '', fraction: null })
  })
})
