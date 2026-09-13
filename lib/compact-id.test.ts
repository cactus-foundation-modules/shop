import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { compactId, expandId } from './compact-id'

// An id that comes back one character wrong is a card whose carousel no longer
// matches the colours a filter asked for - nothing a test of the card would
// notice. So the spelling is checked on its own, against every awkward case.

describe('compactId and expandId', () => {
  it('folds a database uuid to twenty-two characters and back', () => {
    for (let run = 0; run < 2000; run++) {
      const id = randomUUID()
      const wire = compactId(id)
      expect(wire).toHaveLength(22)
      expect(expandId(wire)).toBe(id)
    }
  })

  it('writes exactly the standard url-safe base64 of the uuid bytes', () => {
    // A standard spelling, so anybody reading a payload by hand can decode it
    // with the tools they already have - and so it agrees with filters-for-shop's
    // own copy of this file without the two sharing code.
    for (let run = 0; run < 200; run++) {
      const id = randomUUID()
      const bytes = Buffer.from(id.replaceAll('-', ''), 'hex')
      expect(compactId(id)).toBe(bytes.toString('base64url'))
    }
  })

  it('handles the lowest and highest uuids', () => {
    expect(compactId('00000000-0000-0000-0000-000000000000')).toBe('AAAAAAAAAAAAAAAAAAAAAA')
    expect(compactId('ffffffff-ffff-ffff-ffff-ffffffffffff')).toBe('_____________________w')
    expect(expandId('AAAAAAAAAAAAAAAAAAAAAA')).toBe('00000000-0000-0000-0000-000000000000')
    expect(expandId('_____________________w')).toBe('ffffffff-ffff-ffff-ffff-ffffffffffff')
  })

  it('carries anything that is not a lowercase uuid as itself', () => {
    const awkward = [
      'cat:12d48796-edd9-407c-85f0-3ec6a53b373a',
      'src-1',
      '12D48796-EDD9-407C-85F0-3EC6A53B373A',
      '12d48796edd9407c85f03ec6a53b373a',
      '',
      '~',
      '~already-marked',
      // Exactly the shape a folded uuid has - it must still come back as text.
      'AAAAAAAAAAAAAAAAAAAAAA',
      'café 🪑',
    ]
    for (const id of awkward) {
      const wire = compactId(id)
      expect(wire.startsWith('~')).toBe(true)
      expect(expandId(wire)).toBe(id)
    }
  })

  it('hands back a string it never wrote untouched', () => {
    // Twenty-two characters whose last one could not end a folded uuid.
    expect(expandId('AAAAAAAAAAAAAAAAAAAAAB')).toBe('AAAAAAAAAAAAAAAAAAAAAB')
    expect(expandId('short')).toBe('short')
    // A uuid spelled out in full, which is how a card carried one before ids were
    // folded, reads as itself.
    expect(expandId('12d48796-edd9-407c-85f0-3ec6a53b373a')).toBe('12d48796-edd9-407c-85f0-3ec6a53b373a')
  })
})
