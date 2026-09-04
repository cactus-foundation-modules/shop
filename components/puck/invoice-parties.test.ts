import { describe, expect, it } from 'vitest'
import { addressedLines } from '@/modules/shop/components/puck/invoice-parts'

// Who a trade document is addressed to. The failure this pins is a quiet one:
// the organisation printed twice, once because the layout asked for it on the top
// line and once because it was already sitting in the address underneath.

const ADDRESS = ['Jane Smith', 'Acme Ltd', '4 Example Road', 'Manchester', 'M1 2AB']

describe('addressedLines', () => {
  it('leaves the address exactly as it was when the layout has not asked', () => {
    expect(addressedLines(ADDRESS, 'Acme Ltd', 'person')).toEqual(ADDRESS)
  })

  it('lifts the organisation to the top line and does not repeat it', () => {
    expect(addressedLines(ADDRESS, 'Acme Ltd', 'organisation')).toEqual([
      'Acme Ltd', 'Jane Smith', '4 Example Road', 'Manchester', 'M1 2AB',
    ])
  })

  it('adds the organisation when the address never carried one', () => {
    const noCompany = ['Jane Smith', '4 Example Road', 'Manchester', 'M1 2AB']
    expect(addressedLines(noCompany, 'Acme Ltd', 'organisation')).toEqual(['Acme Ltd', ...noCompany])
  })

  it('leaves a private buyer alone - there is no organisation to lead with', () => {
    const noCompany = ['Jane Smith', '4 Example Road', 'Manchester', 'M1 2AB']
    expect(addressedLines(noCompany, '', 'organisation')).toEqual(noCompany)
    expect(addressedLines(noCompany, undefined, 'organisation')).toEqual(noCompany)
  })

  it('matches on the trimmed line, so stray whitespace does not cause a double', () => {
    expect(addressedLines(['Jane Smith', '  Acme Ltd  ', 'M1 2AB'], 'Acme Ltd', 'organisation'))
      .toEqual(['Acme Ltd', 'Jane Smith', 'M1 2AB'])
  })

  describe('the organisation on its own', () => {
    it('drops the person named on the address', () => {
      expect(addressedLines(ADDRESS, 'Acme Ltd', 'organisation-only', 'Jane Smith'))
        .toEqual(['Acme Ltd', '4 Example Road', 'Manchester', 'M1 2AB'])
    })

    it('does not care how the name was capitalised', () => {
      expect(addressedLines(['JANE SMITH', '4 Example Road'], 'Acme Ltd', 'organisation-only', 'Jane Smith'))
        .toEqual(['Acme Ltd', '4 Example Road'])
    })

    it('keeps a first line that is not the person - an address with no name on it', () => {
      expect(addressedLines(['4 Example Road', 'Manchester'], 'Acme Ltd', 'organisation-only', 'Jane Smith'))
        .toEqual(['Acme Ltd', '4 Example Road', 'Manchester'])
    })

    it('only ever drops the top line, so a namesake further down survives', () => {
      expect(addressedLines(['Jane Smith', 'Jane Smith House'], 'Acme Ltd', 'organisation-only', 'Jane Smith House'))
        .toEqual(['Acme Ltd', 'Jane Smith', 'Jane Smith House'])
    })

    it('leaves a private buyer alone - there is no organisation to address it to', () => {
      const noCompany = ['Jane Smith', '4 Example Road']
      expect(addressedLines(noCompany, '', 'organisation-only', 'Jane Smith')).toEqual(noCompany)
    })

    it('leads with the organisation when no name was passed at all', () => {
      expect(addressedLines(ADDRESS, 'Acme Ltd', 'organisation-only'))
        .toEqual(['Acme Ltd', 'Jane Smith', '4 Example Road', 'Manchester', 'M1 2AB'])
    })
  })
})
