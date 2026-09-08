import { describe, it, expect } from 'vitest'
import {
  FAST_POLL_MS,
  SLOW_POLL_MS,
  livePollIntervalMs,
  positionFreshness,
} from '@/modules/shop/lib/tracking/live-delivery'

const NOW = new Date('2026-09-08T13:30:00.000Z')

function agedBy(ms: number): Date {
  return new Date(NOW.getTime() - ms)
}

describe('positionFreshness', () => {
  it('counts seconds while a fix is new', () => {
    expect(positionFreshness(agedBy(12_000), NOW)).toEqual({ text: 'Updated 12 seconds ago', stale: false })
    expect(positionFreshness(agedBy(1_000), NOW)?.text).toBe('Updated 1 second ago')
  })

  it('counts minutes after that, and calls it stale at five', () => {
    // Five minutes is the courier's own threshold - their page greys the line
    // at the same point. Two screens about the same van should not disagree
    // about whether to believe it.
    expect(positionFreshness(agedBy(4 * 60_000), NOW)).toEqual({ text: 'Updated 4 minutes ago', stale: false })
    expect(positionFreshness(agedBy(5 * 60_000), NOW)).toEqual({ text: 'Updated 5 minutes ago', stale: true })
  })

  it('counts hours, then gives up on precision', () => {
    expect(positionFreshness(agedBy(3 * 3_600_000), NOW)).toEqual({ text: 'Updated 3 hours ago', stale: true })
    expect(positionFreshness(agedBy(50 * 3_600_000), NOW)).toEqual({ text: 'Updated over a day ago', stale: true })
  })

  it('does not age a fix from the future', () => {
    // A courier's clock a few seconds ahead of ours is not a fresher position,
    // and "updated -4 seconds ago" helps nobody.
    expect(positionFreshness(agedBy(-4_000), NOW)).toEqual({ text: 'Updated just now', stale: false })
  })

  it('is nothing when the van has never reported', () => {
    expect(positionFreshness(null, NOW)).toBeNull()
  })
})

describe('livePollIntervalMs', () => {
  it('speeds up once the crew says we are next', () => {
    expect(livePollIntervalMs(1)).toBe(FAST_POLL_MS)
    expect(livePollIntervalMs(0)).toBe(FAST_POLL_MS)
  })

  it('takes its time while there are drops in between', () => {
    expect(livePollIntervalMs(2)).toBe(SLOW_POLL_MS)
    expect(livePollIntervalMs(9)).toBe(SLOW_POLL_MS)
  })

  it('takes its time when the sentence could not be read', () => {
    // An unreadable sentence is not evidence the van is close. Guessing the
    // other way would put every parcel on the fast tick the day they reword it.
    expect(livePollIntervalMs(null)).toBe(SLOW_POLL_MS)
    expect(livePollIntervalMs(undefined)).toBe(SLOW_POLL_MS)
  })
})
