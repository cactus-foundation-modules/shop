import { describe, expect, it } from 'vitest'
import { resolveLineMeta, type CartLineResolution, type CartLineResolver } from '@/modules/shop/lib/line-meta'

// What the resolvers say about returns has to survive the fold.
//
// It did not. `returns` was accepted on a resolution, documented at both ends,
// and then quietly dropped by resolveLineMeta - which builds its answer field by
// field - so every checkout saw "no opinion" and fell back to the line's own
// product row. A variation child's row is blank, blank reads as returnable, and
// a made-to-order chair was snapshotted onto a real order as returnable and
// offered the customer a cancel button. Hence a test per rule rather than a
// glance at the merge.

const product = { id: 'child', returnable: null } as never

const resolver = (returns: CartLineResolution['returns']): CartLineResolver => () => ({
  valid: true,
  priceAdjust: 0,
  persistMeta: null,
  returns,
})

describe('resolveLineMeta returns', () => {
  it('carries a resolver answer through instead of dropping it', async () => {
    const out = await resolveLineMeta(product, undefined, [
      resolver({ returnable: false, note: 'Upholstered to order.' }),
    ])
    expect(out.returns).toEqual({ returnable: false, note: 'Upholstered to order.', discretionary: false })
  })

  it('leaves the line on its own product row when no resolver has an opinion', async () => {
    const out = await resolveLineMeta(product, undefined, [resolver(null)])
    expect(out.returns ?? null).toBeNull()
  })

  it('lets a refusal stand however many resolvers say nothing about it', async () => {
    const out = await resolveLineMeta(product, undefined, [
      resolver({ returnable: false, note: 'Cut to size.' }),
      resolver(null),
    ])
    expect(out.returns?.returnable).toBe(false)
  })

  it('takes the strictest flag when two resolvers disagree', async () => {
    const out = await resolveLineMeta(product, undefined, [
      resolver({ returnable: true, note: null }),
      resolver({ returnable: false, note: 'Made to order.' }),
    ])
    expect(out.returns?.returnable).toBe(false)
  })

  it('never talks a discretion back up into a promise', async () => {
    const out = await resolveLineMeta(product, undefined, [
      resolver({ returnable: true, note: null, discretionary: true }),
      resolver({ returnable: true, note: null, discretionary: false }),
    ])
    expect(out.returns?.discretionary).toBe(true)
  })

  it('keeps the first note written, a blank being "none written"', async () => {
    const out = await resolveLineMeta(product, undefined, [
      resolver({ returnable: false, note: null }),
      resolver({ returnable: false, note: 'The listing says why.' }),
    ])
    expect(out.returns?.note).toBe('The listing says why.')
  })
})
