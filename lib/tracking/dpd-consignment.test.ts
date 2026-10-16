import { beforeEach, describe, expect, it, vi } from 'vitest'

// DW000231, 16 October 2026: delivery 5217099684 went out as four boxes,
// 684 to 687. Three were delivered at 12:06; 687 was held at a hub. The next
// number along, 688, was somebody else's delivery.
type Box = { status: string; consignment: string }
const DPD: Record<string, Box> = {
  '15505217099684*21473': { status: 'Your parcel has been delivered at 12:06 on Fri 16 Oct 2026', consignment: '5217099684' },
  '15505217099685*21473': { status: 'Your parcel has been delivered at 12:06 on Fri 16 Oct 2026', consignment: '5217099684' },
  '15505217099686*21473': { status: 'Your parcel has been delivered at 12:06 on Fri 16 Oct 2026', consignment: '5217099684' },
  '15505217099687*21473': { status: "Sorry, there's a delay with your parcel at our sortation facility", consignment: '5217099684' },
  '15505217099688*21473': { status: 'Your parcel has been delivered at 11:05 on Fri 16 Oct 2026', consignment: '5217099688' },
}
// Which box each follow-my-parcel code opens - from three different DPD emails.
const SESSIONS: Record<string, string> = {
  '6dPoGbFMMrsp': '15505217099684*21473',
  '6dPoGbF1J8vF': '15505217099685*21473',
  '6dPoGbFSZFR6': '15505217099687*21473',
  'StrangerCode1': '15505217099688*21473',
}

function payload(code: string) {
  const box = DPD[code]
  if (!box) return null
  const digits = code.split('*')[0] as string
  return { data: { parcelCode: code, parcelNumber: digits, consignmentNumber: box.consignment, trackingStatusCurrent: box.status } }
}

let offline = new Set<string>()
const lookUpDpdParcel = vi.fn(async (code: string) => (offline.has(code) ? null : payload(code) ?? 'missing'))
const mintDpdSession = vi.fn(async (code: string) => {
  const parcelCode = SESSIONS[code]
  return parcelCode ? { cookie: `sessionId=${code}`, parcelCode } : null
})
vi.mock('@/modules/shop/lib/tracking/dpd-session', () => ({ lookUpDpdParcel, mintDpdSession }))

const { findDpdConsignment, resolveDpdConsignmentLinks } = await import('@/modules/shop/lib/tracking/dpd-consignment')

beforeEach(() => {
  offline = new Set()
  lookUpDpdParcel.mockClear()
  mintDpdSession.mockClear()
})

describe('findDpdConsignment', () => {
  it('finds every box from the last one, and stops at a stranger', async () => {
    const found = await findDpdConsignment('15505217099687*21473')
    expect(found?.consignmentNumber).toBe('5217099684')
    expect(found?.boxes.map((b) => b.code)).toEqual([
      '15505217099684*21473',
      '15505217099685*21473',
      '15505217099686*21473',
      '15505217099687*21473',
    ])
    expect(found?.boxes.map((b) => b.delivered)).toEqual([true, true, true, false])
  })

  it('stops at DPD\'s own count when the session gave one', async () => {
    const known = { data: { ...payload('15505217099684*21473')?.data, deliveryDetails: { numberOfParcels: 2 } } }
    const found = await findDpdConsignment('15505217099684*21473', known)
    expect(found?.boxes).toHaveLength(2)
  })

  it('gives up rather than reporting a shorter delivery when DPD do not answer', async () => {
    offline.add('15505217099686*21473')
    expect(await findDpdConsignment('15505217099687*21473')).toBeNull()
  })

  it('reads a box numbered some other way as a delivery of one', async () => {
    lookUpDpdParcel.mockImplementationOnce(async () => ({
      data: { parcelCode: '99*1', parcelNumber: '99', consignmentNumber: '5217099684', trackingStatusCurrent: 'On its way' },
    }))
    const found = await findDpdConsignment('99*1')
    expect(found?.boxes).toHaveLength(1)
  })
})

describe('resolveDpdConsignmentLinks', () => {
  const nothing = { number: null, parcels: null }

  it('puts each link on the box it opens, whatever order they were pasted in', async () => {
    const result = await resolveDpdConsignmentLinks({
      mainCode: '6dPoGbFSZFR6',
      trackingUrl: 'https://www.dpd.co.uk/d/6dPoGbFSZFR6',
      existing: nothing,
      restart: true,
      extraLinks: ['https://www.dpd.co.uk/d/6dPoGbF1J8vF', 'dpd.co.uk/d/6dPoGbFMMrsp'],
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.consignment?.number).toBe('5217099684')
    expect(Object.fromEntries(result.consignment?.parcels.map((p) => [p.code.slice(11, 14), p.shortCode]) ?? [])).toEqual({
      '684': '6dPoGbFMMrsp',
      '685': '6dPoGbF1J8vF',
      '686': null,
      '687': '6dPoGbFSZFR6',
    })
  })

  it('refuses a link for somebody else\'s delivery', async () => {
    const result = await resolveDpdConsignmentLinks({
      mainCode: '6dPoGbFSZFR6',
      trackingUrl: 'https://www.dpd.co.uk/d/6dPoGbFSZFR6',
      existing: nothing,
      restart: true,
      extraLinks: ['https://www.dpd.co.uk/d/StrangerCode1'],
    })
    expect(result.ok).toBe(false)
  })

  it('refuses something that is not a follow-my-parcel link', async () => {
    const result = await resolveDpdConsignmentLinks({
      mainCode: null,
      trackingUrl: null,
      existing: nothing,
      restart: true,
      extraLinks: ['https://track.dpd.co.uk/parcels/15505217099684*21473'],
    })
    expect(result.ok).toBe(false)
    expect(mintDpdSession).not.toHaveBeenCalled()
  })

  it('does not spend a DPD check on a link a box already has', async () => {
    const first = await resolveDpdConsignmentLinks({
      mainCode: '6dPoGbFSZFR6',
      trackingUrl: 'https://www.dpd.co.uk/d/6dPoGbFSZFR6',
      existing: nothing,
      restart: true,
      extraLinks: [],
    })
    if (!first.ok || !first.consignment) throw new Error('expected boxes')
    mintDpdSession.mockClear()
    const again = await resolveDpdConsignmentLinks({
      mainCode: '6dPoGbFSZFR6',
      trackingUrl: 'https://www.dpd.co.uk/d/6dPoGbFSZFR6',
      existing: first.consignment,
      restart: false,
      extraLinks: ['https://www.dpd.co.uk/d/6dPoGbFMMrsp'],
    })
    expect(mintDpdSession).toHaveBeenCalledTimes(1)
    expect(again.ok && again.consignment?.parcels[0]?.shortCode).toBe('6dPoGbFMMrsp')
  })

  it('says so when another box\'s link cannot be checked, rather than dropping it', async () => {
    mintDpdSession.mockImplementation(async (code: string) => (code === '6dPoGbFSZFR6'
      ? { cookie: 'sessionId=x', parcelCode: '15505217099687*21473' }
      : null))
    const result = await resolveDpdConsignmentLinks({
      mainCode: '6dPoGbFSZFR6',
      trackingUrl: 'https://www.dpd.co.uk/d/6dPoGbFSZFR6',
      existing: nothing,
      restart: true,
      extraLinks: ['https://www.dpd.co.uk/d/6dPoGbFMMrsp'],
    })
    expect(result.ok).toBe(false)
  })
})
