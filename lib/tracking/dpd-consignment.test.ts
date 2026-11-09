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
const openSession = async (code: string) => {
  const parcelCode = SESSIONS[code]
  return parcelCode ? { cookie: `sessionId=${code}`, parcelCode } : null
}
const mintDpdSession = vi.fn(openSession)
vi.mock('@/modules/shop/lib/tracking/dpd-session', () => ({ lookUpDpdParcel, mintDpdSession }))

const { findDpdConsignment, findDpdParcelByNumber, placePendingDpdLinks, resolveDpdConsignmentLinks } = await import('@/modules/shop/lib/tracking/dpd-consignment')

beforeEach(() => {
  offline = new Set()
  lookUpDpdParcel.mockClear()
  mintDpdSession.mockClear()
  mintDpdSession.mockImplementation(openSession)
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

  it('keeps a link DPD would not check for later, rather than refusing the save or dropping it', async () => {
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
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.consignment?.parcels).toHaveLength(4)
    expect(result.pending).toEqual(['6dPoGbFMMrsp'])
  })

  // DW000278, 9 November 2026: DPD answered every session check with a 429
  // for an hour, and the dispatch could not be saved at all.
  it('finds the boxes from the typed parcel number when DPD will not open any link', async () => {
    mintDpdSession.mockImplementation(async () => null)
    const result = await resolveDpdConsignmentLinks({
      mainCode: '6dPoGbFSZFR6',
      trackingUrl: 'https://www.dpd.co.uk/d/6dPoGbFSZFR6',
      parcelNumber: '1550 5217 099 684 K',
      labelDate: new Date('2026-10-16T09:00:00Z'),
      existing: nothing,
      restart: true,
      extraLinks: ['https://www.dpd.co.uk/d/6dPoGbFMMrsp', 'https://www.dpd.co.uk/d/6dPoGbF1J8vF'],
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.consignment?.number).toBe('5217099684')
    expect(result.consignment?.parcels.map((p) => p.shortCode)).toEqual([null, null, null, null])
    // The first refusal ends the asking - the rest wait without spending a check.
    expect(mintDpdSession).toHaveBeenCalledTimes(1)
    expect(result.pending).toEqual(['6dPoGbFSZFR6', '6dPoGbFMMrsp', '6dPoGbF1J8vF'])
  })

  it('still saves with every link waiting when there is nothing to find the boxes from', async () => {
    mintDpdSession.mockImplementation(async () => null)
    const result = await resolveDpdConsignmentLinks({
      mainCode: '6dPoGbFSZFR6',
      trackingUrl: 'https://www.dpd.co.uk/d/6dPoGbFSZFR6',
      existing: nothing,
      restart: true,
      extraLinks: ['https://www.dpd.co.uk/d/6dPoGbFMMrsp'],
    })
    expect(result).toEqual({ ok: true, consignment: null, pending: ['6dPoGbFMMrsp'] })
  })
})

describe('findDpdParcelByNumber', () => {
  it('finds the label day from the dispatch date, counting back', async () => {
    // 21473 is 15 October 2026; dispatched the day after.
    const found = await findDpdParcelByNumber('1550 5217 099 685 H', new Date('2026-10-16T12:00:00Z'))
    expect(found?.code).toBe('15505217099685*21473')
  })

  it('takes a full code as typed and asks nothing else', async () => {
    const found = await findDpdParcelByNumber('15505217099686*21473', new Date('2020-01-01'))
    expect(found?.code).toBe('15505217099686*21473')
    expect(lookUpDpdParcel).toHaveBeenCalledTimes(1)
  })

  it('will not guess from something that is not a parcel number', async () => {
    expect(await findDpdParcelByNumber('5217099684', new Date('2026-10-16'))).toBeNull()
    expect(lookUpDpdParcel).not.toHaveBeenCalled()
  })
})

describe('placePendingDpdLinks', () => {
  const boxes = ['684', '685', '686', '687'].map((n) => ({
    code: `15505217099${n}*21473`, number: n, shortCode: null, stage: null, delivered: false,
    deliveredAt: null, receivedBy: null, photoUrl: null, photoKey: null, photoRef: null, checkedAt: null,
  }))

  it('puts each waiting link on its box once DPD answer', async () => {
    const result = await placePendingDpdLinks(boxes, ['6dPoGbFSZFR6', '6dPoGbFMMrsp'])
    expect(result.pending).toEqual([])
    expect(result.boxes.map((b) => b.shortCode)).toEqual(['6dPoGbFMMrsp', null, null, '6dPoGbFSZFR6'])
  })

  it('keeps the rest waiting from the first refusal, and drops a stranger\'s link', async () => {
    mintDpdSession.mockImplementation(async (code: string) => (code === 'StrangerCode1'
      ? { cookie: 'x', parcelCode: '15505217099688*21473' }
      : null))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const result = await placePendingDpdLinks(boxes, ['StrangerCode1', '6dPoGbFMMrsp', '6dPoGbF1J8vF'])
    expect(result.pending).toEqual(['6dPoGbFMMrsp', '6dPoGbF1J8vF'])
    expect(result.boxes.every((b) => b.shortCode === null)).toBe(true)
    expect(mintDpdSession).toHaveBeenCalledTimes(2)
    warn.mockRestore()
  })
})
