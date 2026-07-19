import { describe, it, expect } from 'vitest'
import { planImageRenames } from './product-media'

// Renumbering product images is a permutation, and the relocate underneath is
// told to 'replace' whatever holds a name it wants. Replace deletes what it
// finds, and an exact-name key is derived from the name, so a name clash between
// two of ONE product's own images overwrites a live blob and then deletes the
// row that owned it. That is not theoretical: reordering a chair's photos left
// the product showing the same picture twice under two different urls, with the
// original bytes gone from storage.
//
// So these tests only ever assert one thing, from several angles: at the moment
// any image is told to take a name, no sibling is still using that name.

const park = (id: string) => `parking-${id}`

/** Replay the plan and fail the moment a step would land on an occupied name. */
function replay(items: Array<{ mediaId: string; currentName: string | null; target: string }>) {
  const held = new Map<string, string>() // name -> media id holding it
  for (const item of items) if (item.currentName) held.set(item.currentName, item.mediaId)

  for (const step of planImageRenames(items, park)) {
    const occupant = held.get(step.name)
    if (occupant && occupant !== step.mediaId) {
      throw new Error(`${step.mediaId} told to take "${step.name}", still held by ${occupant}`)
    }
    for (const [name, id] of held) if (id === step.mediaId) held.delete(name)
    held.set(step.name, step.mediaId)
  }

  return Object.fromEntries([...held].map(([name, id]) => [id, name]))
}

describe('planImageRenames', () => {
  it('leaves an already-correct list alone', () => {
    const items = [
      { mediaId: 'a', currentName: 'chair1', target: 'chair1' },
      { mediaId: 'b', currentName: 'chair2', target: 'chair2' },
    ]
    expect(planImageRenames(items, park).filter((s) => s.frees)).toHaveLength(0)
    expect(replay(items)).toEqual({ a: 'chair1', b: 'chair2' })
  })

  it('survives two images swapping places', () => {
    const items = [
      { mediaId: 'a', currentName: 'chair2', target: 'chair1' },
      { mediaId: 'b', currentName: 'chair1', target: 'chair2' },
    ]
    expect(replay(items)).toEqual({ a: 'chair1', b: 'chair2' })
  })

  it('survives a full rotation', () => {
    const items = [
      { mediaId: 'a', currentName: 'chair3', target: 'chair1' },
      { mediaId: 'b', currentName: 'chair1', target: 'chair2' },
      { mediaId: 'c', currentName: 'chair2', target: 'chair3' },
    ]
    expect(replay(items)).toEqual({ a: 'chair1', b: 'chair2', c: 'chair3' })
  })

  it('survives a new image landing in the middle, pushing the rest down', () => {
    const items = [
      { mediaId: 'a', currentName: 'chair1', target: 'chair1' },
      { mediaId: 'new', currentName: null, target: 'chair2' },
      { mediaId: 'b', currentName: 'chair2', target: 'chair3' },
      { mediaId: 'c', currentName: 'chair3', target: 'chair4' },
    ]
    expect(replay(items)).toEqual({ a: 'chair1', new: 'chair2', b: 'chair3', c: 'chair4' })
  })

  it('survives a deletion pulling the rest up', () => {
    const items = [
      { mediaId: 'a', currentName: 'chair1', target: 'chair1' },
      { mediaId: 'c', currentName: 'chair3', target: 'chair2' },
    ]
    expect(replay(items)).toEqual({ a: 'chair1', c: 'chair2' })
  })

  it('parks nothing that nobody is waiting for', () => {
    // An unfiled upload and an image whose name no sibling wants both go
    // straight to their target - parking costs a blob copy, so it is not paid
    // unless a clash actually needs it.
    const items = [
      { mediaId: 'a', currentName: 'g-abc123-chiro-black-leather', target: 'chair1' },
      { mediaId: 'b', currentName: null, target: 'chair2' },
    ]
    expect(planImageRenames(items, park).filter((s) => s.frees)).toHaveLength(0)
  })

  it('parks only the images that are actually in another image\'s way', () => {
    const items = [
      { mediaId: 'a', currentName: 'chair1', target: 'chair1' },
      { mediaId: 'b', currentName: 'chair3', target: 'chair2' },
      { mediaId: 'c', currentName: 'unfiled', target: 'chair3' },
    ]
    expect(planImageRenames(items, park).filter((s) => s.frees)).toEqual([
      { mediaId: 'b', name: 'parking-b', frees: 'chair3' },
    ])
    expect(replay(items)).toEqual({ a: 'chair1', b: 'chair2', c: 'chair3' })
  })

  it('names every image exactly once at the end', () => {
    const items = [
      { mediaId: 'a', currentName: 'chair2', target: 'chair1' },
      { mediaId: 'b', currentName: 'chair1', target: 'chair2' },
      { mediaId: 'c', currentName: 'chair4', target: 'chair3' },
      { mediaId: 'd', currentName: 'chair3', target: 'chair4' },
    ]
    const steps = planImageRenames(items, park)
    const finals = steps.filter((s) => !s.frees).map((s) => s.mediaId)
    expect(finals).toEqual(['a', 'b', 'c', 'd'])
    expect(replay(items)).toEqual({ a: 'chair1', b: 'chair2', c: 'chair3', d: 'chair4' })
  })
})
