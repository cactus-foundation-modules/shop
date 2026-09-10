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
    stopsCompleted: 32,
    stopsTotal: 98,
    minutesToStop: 15,
    checkedAt: NOW,
    now: NOW,
  }

  // The bar and the sentence are both about how close the van is to YOU. Drawn
  // against the driver's whole day, 32 of 98 showed a third of a bar while the
  // van was two streets away.
  it('counts the drops before yours, not the driver day', () => {
    const p = liveProgress(base)
    expect(p.round).toBe('Mozam has 2 more drops to make before yours.')
    expect(p.yours).toBe('About 15 minutes away.')
    expect(p.fraction).toBeCloseTo(32 / 34)
  })

  it('says it plainly when yours is the next one', () => {
    expect(liveProgress({ ...base, stopsCompleted: 33 }).round)
      .toBe('Mozam has one more drop to make before yours.')
    expect(liveProgress({ ...base, stopsCompleted: 34 }).round)
      .toBe('Mozam is on their way to you now.')
  })

  // A driver past your stop is a question for somebody, not a bar drawn
  // backwards.
  it('floors rather than going negative', () => {
    const p = liveProgress({ ...base, stopsCompleted: 40 })
    expect(p.round).toBe('Mozam is on their way to you now.')
    expect(p.fraction).toBe(1)
  })

  // The estimate was true when it was read, and it is read on a schedule.
  it('takes off the time since it was read', () => {
    const p = liveProgress({ ...base, minutesToStop: 90, now: new Date('2026-09-10T12:00:00Z') })
    expect(p.yours).toBe('About 30 minutes away.')
  })

  it('stops claiming anything rather than counting backwards', () => {
    const p = liveProgress({ ...base, now: new Date('2026-09-10T14:00:00Z') })
    expect(p.yours).toBe('Any minute now.')
  })

  it('drops the half it was not told rather than guessing it', () => {
    expect(liveProgress({ ...base, stopsCompleted: null }).round).toBe('')
    expect(liveProgress({ ...base, stopsCompleted: null }).fraction).toBeNull()
    expect(liveProgress({ ...base, stopNumber: null }).round).toBe('')
    expect(liveProgress({ ...base, minutesToStop: null }).yours).toBe('')
  })

  it('manages without a driver name', () => {
    expect(liveProgress({ ...base, driverName: null }).round)
      .toBe('Your driver has 2 more drops to make before yours.')
  })

  it('says nothing at all when the courier said nothing', () => {
    const p = liveProgress({
      driverName: null, stopNumber: null, stopsCompleted: null,
      stopsTotal: null, minutesToStop: null, checkedAt: null, now: NOW,
    })
    expect(p).toEqual({ round: '', yours: '', fraction: null })
  })
})
