import { describe, expect, it } from 'vitest'
import { addressedLines } from '@/modules/shop/components/puck/invoice-parts'

// Who a trade document is addressed to. The failure this pins is a quiet one:
// the organisation printed twice, once because the layout asked for it on the top
// line and once because it was already sitting in the address underneath.

const ADDRESS = ['Jane Smith', 'Acme Ltd', '4 Example Road', 'Manchester', 'M1 2AB']

describe('addressedLines', () => {
  it('leaves the address exactly as it was when the layout has not asked', () => {
    expect(addressedLines(ADDRESS, 'Acme Ltd', false)).toEqual(ADDRESS)
  })

  it('lifts the organisation to the top line and does not repeat it', () => {
    expect(addressedLines(ADDRESS, 'Acme Ltd', true)).toEqual([
      'Acme Ltd', 'Jane Smith', '4 Example Road', 'Manchester', 'M1 2AB',
    ])
  })

  it('adds the organisation when the address never carried one', () => {
    const noCompany = ['Jane Smith', '4 Example Road', 'Manchester', 'M1 2AB']
    expect(addressedLines(noCompany, 'Acme Ltd', true)).toEqual(['Acme Ltd', ...noCompany])
  })

  it('leaves a private buyer alone - there is no organisation to lead with', () => {
    const noCompany = ['Jane Smith', '4 Example Road', 'Manchester', 'M1 2AB']
    expect(addressedLines(noCompany, '', true)).toEqual(noCompany)
    expect(addressedLines(noCompany, undefined, true)).toEqual(noCompany)
  })

  it('matches on the trimmed line, so stray whitespace does not cause a double', () => {
    expect(addressedLines(['Jane Smith', '  Acme Ltd  ', 'M1 2AB'], 'Acme Ltd', true))
      .toEqual(['Acme Ltd', 'Jane Smith', 'M1 2AB'])
  })
})
