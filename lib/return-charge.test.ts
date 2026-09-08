import { describe, it, expect } from 'vitest'
import { netOffReturnCharge } from '@/modules/shop/lib/return-charge'

// The arithmetic that decides how much money actually goes back. Every case
// here is one that would be noticed by a customer holding a bank statement.

const line = (orderItemId: string, amount: number, quantity = 1) => ({ orderItemId, quantity, amount })

describe('netOffReturnCharge', () => {
  it('leaves the lines alone when there is no charge', () => {
    const lines = [line('a', 100), line('b', 50)]
    const out = netOffReturnCharge(lines, 0)
    expect(out.ok && out.lines).toEqual(lines)
    expect(out.ok && out.total).toBe(150)
    expect(out.ok && out.charge).toBe(0)
  })

  it('treats a negative or nonsense charge as no charge at all', () => {
    const lines = [line('a', 100)]
    const negative = netOffReturnCharge(lines, -25)
    expect(negative.ok && negative.charge).toBe(0)
    expect(netOffReturnCharge(lines, Number.NaN).ok).toBe(true)
  })

  it('takes the charge off the total', () => {
    const out = netOffReturnCharge([line('a', 100), line('b', 100)], 40)
    expect(out.ok && out.total).toBe(160)
    expect(out.ok && out.charge).toBe(40)
  })

  // The whole reason it is spread rather than parked on one line: refunds are
  // written a line at a time and each is capped against the units it covers.
  it('spreads the charge across the lines by value', () => {
    const out = netOffReturnCharge([line('a', 300), line('b', 100)], 40)
    expect(out.ok && out.lines.map((l) => l.amount)).toEqual([270, 90])
  })

  it('never lets the lines add up to anything but the intended refund', () => {
    // Three thirds of a tenner and a charge that does not divide: the shares
    // round to 3.11 apiece and would sum a penny short.
    const out = netOffReturnCharge([line('a', 3.34), line('b', 3.33), line('c', 3.33)], 0.66)
    expect(out.ok).toBe(true)
    if (!out.ok) return
    const summed = Number(out.lines.reduce((sum, l) => sum + l.amount, 0).toFixed(2))
    expect(summed).toBe(out.total)
    expect(out.total).toBe(9.34)
  })

  it('puts the rounding remainder on the biggest line, where a penny does not show', () => {
    const out = netOffReturnCharge([line('a', 3.34), line('b', 3.33), line('c', 3.33)], 0.66)
    expect(out.ok && out.lines[0]!.amount).toBeGreaterThanOrEqual(out.ok ? out.lines[1]!.amount : 0)
  })

  it('refuses a charge that swallows the whole refund, rather than sending back nothing', () => {
    const out = netOffReturnCharge([line('a', 50)], 50)
    expect(out.ok).toBe(false)
    expect(!out.ok && out.error).toContain('as much as the refund')
  })

  it('refuses a charge bigger than the refund', () => {
    expect(netOffReturnCharge([line('a', 50)], 75).ok).toBe(false)
  })

  it('allows a charge that leaves something worth sending', () => {
    const out = netOffReturnCharge([line('a', 50)], 49.5)
    expect(out.ok && out.total).toBe(0.5)
  })

  it('keeps the quantities exactly as they were - only the money moves', () => {
    const out = netOffReturnCharge([line('a', 100, 2), line('b', 100, 3)], 20)
    expect(out.ok && out.lines.map((l) => l.quantity)).toEqual([2, 3])
  })
})
