import { describe, expect, it } from 'vitest'
import { batchLines, sortLinesByGroup } from '@/modules/shop/lib/cart-group'

type Batch = { id: string; sort: string; heading: string; uniformHeading?: string; detail?: string; fieldLabel?: string }
type Line = {
  id: string
  group?: { key: string; role: 'main' | 'attachment'; caption?: string; order?: number } | null
  batch?: Batch | null
}

const line = (id: string, batch?: Batch | null, group?: Line['group']): Line => ({ id, batch: batch ?? null, group: group ?? null })

// Two services landing on the 20th, and one on the 4th of September.
const flatSoon: Batch = { id: '2026-08-20', sort: '2026-08-20', heading: 'Arrives by Thursday 20th of August', uniformHeading: 'Flat-pack - by Thursday 20th of August', detail: 'Flat-pack', fieldLabel: 'Delivery' }
const builtSoon: Batch = { ...flatSoon, uniformHeading: 'Pre-assembled - by Thursday 20th of August', detail: 'Pre-assembled' }
const flatLater: Batch = { id: '2026-09-04', sort: '2026-09-04', heading: 'Arrives by Friday 4th of September', uniformHeading: 'Flat-pack - by Friday 4th of September', detail: 'Flat-pack', fieldLabel: 'Delivery' }

const ids = (lines: Line[]) => lines.map((l) => l.id)

describe('batchLines', () => {
  it('buckets by batch id, soonest bucket first', () => {
    const out = batchLines([line('late', flatLater), line('early', flatSoon), line('early2', flatSoon)])
    expect(out.map((b) => b.id)).toEqual(['2026-08-20', '2026-09-04'])
    expect(ids(out[0]!.lines)).toEqual(['early', 'early2'])
    expect(ids(out[1]!.lines)).toEqual(['late'])
    expect(out[0]!.fieldLabel).toBe('Delivery')
  })

  it('takes the fuller heading when every line shares one service', () => {
    const out = batchLines([line('a', flatSoon), line('b', flatSoon)])
    expect(out[0]!.uniform).toBe(true)
    expect(out[0]!.heading).toBe('Flat-pack - by Thursday 20th of August')
  })

  it('keeps one date together when the services differ, and marks it mixed', () => {
    const out = batchLines([line('built', builtSoon), line('flat', flatSoon)])
    expect(out).toHaveLength(1)
    expect(out[0]!.uniform).toBe(false)
    expect(out[0]!.heading).toBe('Arrives by Thursday 20th of August')
    expect(ids(out[0]!.lines)).toEqual(['built', 'flat'])
  })

  it('keeps an attachment with its main even when its own date differs', () => {
    const out = batchLines([
      line('accessory', flatLater, { key: 'g1', role: 'attachment', caption: 'Fitted to the desk' }),
      line('desk', flatSoon, { key: 'g1', role: 'main' }),
    ])
    expect(out).toHaveLength(1)
    expect(ids(out[0]!.lines)).toEqual(['desk', 'accessory'])
    // The carried-in line is not counted towards uniformity - it speaks for
    // itself through its own kept field, so the desk's heading still stands.
    expect(out[0]!.uniform).toBe(true)
  })

  it('trails unbatched lines in one unheaded bucket', () => {
    const out = batchLines([line('plain'), line('dated', flatSoon)])
    expect(out.map((b) => b.heading)).toEqual(['Flat-pack - by Thursday 20th of August', ''])
    expect(ids(out[1]!.lines)).toEqual(['plain'])
  })

  it('returns nothing for an empty basket', () => {
    expect(batchLines([])).toEqual([])
  })
})

describe('sortLinesByGroup', () => {
  it('puts attachments under their main, in declared order', () => {
    const out = sortLinesByGroup([
      line('acc2', null, { key: 'g1', role: 'attachment', order: 2 }),
      line('acc1', null, { key: 'g1', role: 'attachment', order: 1 }),
      line('desk', null, { key: 'g1', role: 'main' }),
      line('chair'),
    ])
    expect(ids(out)).toEqual(['desk', 'acc1', 'acc2', 'chair'])
  })

  it('leaves an orphaned attachment where it was', () => {
    const out = sortLinesByGroup([line('orphan', null, { key: 'gone', role: 'attachment' }), line('chair')])
    expect(ids(out)).toEqual(['orphan', 'chair'])
  })
})
