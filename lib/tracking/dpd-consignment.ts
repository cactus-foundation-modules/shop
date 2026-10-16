// Finding every box in a DPD delivery, from one of them.
//
// A supplier's delivery of four boxes is four DPD parcels under one reference,
// and DPD only ever tell you about the box you asked for. Their search by
// reference returns the FIRST box and no more, and the follow-my-parcel code
// that unlocks a box unlocks that box alone. What gives the rest away is the
// numbering: the boxes are numbered on from the reference (see dpdSiblingCode),
// and every box, asked about anonymously, names the reference it belongs to.
// So the search walks the numbers and keeps each one DPD confirm.
//
// Anonymous throughout. No postcode, no session, no personal data comes back
// on the fifteen-field feed - only a status and the reference - which is why a
// number that turns out to be a stranger's parcel costs nothing but the look.

import { dpdConsignmentFacts, dpdParcelCodeFromUrl, dpdSiblingCode } from '@/modules/shop/lib/tracking/dpd'
import { lookUpDpdParcel, mintDpdSession } from '@/modules/shop/lib/tracking/dpd-session'
import { dpdFollowLinkCode } from '@/modules/shop/lib/tracking/dpd-follow-link'
import { newConsignmentParcel, type ConsignmentParcel } from '@/modules/shop/lib/consignment-parcels'

/** More boxes than any delivery a shop sends; a ceiling on what a bad number
 *  could cost somebody else's server. */
const MAX_BOXES = 30

/** Asked together. No session is involved, so the one-at-a-time rule that
 *  protects a session (dpd-session.ts) does not apply, and a delivery of four
 *  is found in one round trip rather than five. */
const BATCH = 4

export type DpdBox = { code: string; number: string; stage: string | null; delivered: boolean }
export type DpdConsignment = { consignmentNumber: string; boxes: DpdBox[] }

function box(facts: NonNullable<ReturnType<typeof dpdConsignmentFacts>>): DpdBox {
  return { code: facts.code, number: facts.number, stage: facts.stage, delivered: facts.delivered === true }
}

/**
 * Every box in the delivery `parcelCode` belongs to, in DPD's order.
 *
 * `known` is a payload for that parcel already in hand - read with a session,
 * it carries the count of boxes, and the search stops there instead of at the
 * first number that is not one of them.
 *
 * Null when DPD could not be asked properly: a timeout half way through would
 * otherwise read as a smaller delivery, and a smaller delivery whose boxes have
 * all arrived is an order finished off with a box still on a lorry. The caller
 * tries again later. A delivery of one box comes back as a list of one.
 */
export async function findDpdConsignment(parcelCode: string, known?: unknown): Promise<DpdConsignment | null> {
  const first = dpdConsignmentFacts(known) ?? await (async () => {
    const looked = await lookUpDpdParcel(parcelCode)
    return looked && looked !== 'missing' ? dpdConsignmentFacts(looked) : null
  })()
  if (!first) return null

  const reference = first.consignmentNumber
  // No reference, a count of one, or a parcel number that is not numbered from
  // its reference: one box, as it always was.
  if (!reference || first.numberOfParcels === 1 || dpdSiblingCode(first.code, reference, 0) === null) {
    return { consignmentNumber: reference ?? first.code, boxes: [box(first)] }
  }

  const limit = Math.min(first.numberOfParcels ?? MAX_BOXES, MAX_BOXES)
  const boxes: DpdBox[] = []
  for (let start = 0; start < limit; start += BATCH) {
    const indexes = Array.from({ length: Math.min(BATCH, limit - start) }, (_, i) => start + i)
    const codes: Array<string | null> = indexes.map((i) => dpdSiblingCode(first.code, reference, i))
    const answers: unknown[] = await Promise.all(codes.map((code): Promise<unknown> => {
      if (!code) return Promise.resolve('missing' as const)
      // The box in hand is not asked about twice.
      if (code === first.code) return Promise.resolve('self' as const)
      return lookUpDpdParcel(code)
    }))

    for (let i = 0; i < answers.length; i += 1) {
      const answer = answers[i]
      if (answer === null) return null
      const facts = answer === 'self' ? first : answer === 'missing' ? null : dpdConsignmentFacts(answer)
      // The first number that is not this delivery's box is the end of it.
      if (!facts || facts.consignmentNumber !== reference) {
        return boxes.some((b) => b.code === first.code) ? { consignmentNumber: reference, boxes } : null
      }
      boxes.push(box(facts))
    }
  }

  // Ran to DPD's own count (or the ceiling). The box in hand must be among
  // them, or the numbering was not what it looked like.
  return boxes.some((b) => b.code === first.code) ? { consignmentNumber: reference, boxes } : null
}

/** The boxes as the shipment keeps them, carrying over everything already
 *  learned about any box that was there before. */
export function mergeConsignmentBoxes(
  boxes: DpdBox[],
  existing: readonly ConsignmentParcel[] | null,
): ConsignmentParcel[] {
  const before = new Map((existing ?? []).map((p) => [p.code, p]))
  return boxes.map((b) => {
    const was = before.get(b.code)
    if (was) return was
    const fresh = newConsignmentParcel(b.code, b.number)
    return { ...fresh, stage: b.stage, delivered: b.delivered, deliveredAt: b.delivered ? new Date().toISOString() : null }
  })
}

export type ConsignmentLinksResult =
  | { ok: true; consignment: { number: string; parcels: ConsignmentParcel[] } | null }
  | { ok: false; error: string }

const RATE_LIMITED = 'DPD would not check that link just now - they only allow a handful of checks a minute. Give it a minute and save again.'

/**
 * The boxes of a DPD parcel being saved, with each follow-my-parcel link put on
 * the box it opens.
 *
 * Links arrive in any order, from whichever of DPD's emails they were copied
 * out of, so nobody is asked which box a link belongs to: DPD say, by where
 * the link's session points (mintDpdSession). One check per NEW link - a link
 * already on a box is not checked again - because DPD allow five a minute.
 *
 * `mainCode` is the parcel's own follow-my-parcel code, `trackingUrl` its link;
 * `existing` is what the shipment held, ignored when `restart` says the
 * tracking has changed and the old boxes belong to some other delivery.
 *
 * Refuses a link for another delivery outright: saved, it would show the
 * customer a stranger's parcel as one of theirs.
 */
export async function resolveDpdConsignmentLinks(input: {
  mainCode: string | null
  trackingUrl: string | null
  existing: { number: string | null; parcels: ConsignmentParcel[] | null }
  restart: boolean
  extraLinks: string[]
}): Promise<ConsignmentLinksResult> {
  const existingParcels = input.restart ? null : input.existing.parcels
  const known = new Set((existingParcels ?? []).map((p) => p.shortCode).filter((c): c is string => Boolean(c)))

  const extras: string[] = []
  for (const link of input.extraLinks) {
    const code = dpdFollowLinkCode(link)
    if (!code) return { ok: false, error: `"${link}" is not a DPD follow-my-parcel link. They look like https://www.dpd.co.uk/d/6dPoGvP3DMDN.` }
    if (!extras.includes(code)) extras.push(code)
  }
  const toCheck = [input.mainCode, ...extras].filter((c): c is string => Boolean(c) && !known.has(c as string))
  const unique = [...new Set(toCheck)]

  // One at a time: each is a fresh session, and DPD count them.
  const opened = new Map<string, string>()
  for (const code of unique) {
    const session = await mintDpdSession(code)
    if (!session?.parcelCode) {
      // The main link failing to check is not a reason to refuse the save -
      // the hourly check will read it later, as it always has. Another box's
      // link is only worth saving if we know which box it is.
      if (code === input.mainCode && !extras.includes(code)) continue
      return { ok: false, error: RATE_LIMITED }
    }
    opened.set(code, session.parcelCode)
  }

  const anchor = dpdParcelCodeFromUrl(input.trackingUrl)
    ?? (input.mainCode ? opened.get(input.mainCode) : undefined)
    ?? existingParcels?.[0]?.code
    ?? [...opened.values()][0]
    ?? null

  let number = input.restart ? null : input.existing.number
  let parcels = existingParcels
  if (!parcels && anchor) {
    const found = await findDpdConsignment(anchor)
    if (found) {
      number = found.consignmentNumber
      parcels = mergeConsignmentBoxes(found.boxes, null)
    }
  }

  if (!parcels || !number) {
    // Nothing to put the links on. Without other boxes' links that is fine -
    // the tracking check finds the boxes itself - but a link with nowhere to go
    // would be dropped without anybody knowing.
    if (extras.some((c) => !known.has(c))) {
      return { ok: false, error: 'DPD could not be reached to check which parcels those links are for. Give it a minute and save again.' }
    }
    return { ok: true, consignment: input.restart ? null : (input.existing.parcels && input.existing.number ? { number: input.existing.number, parcels: input.existing.parcels } : null) }
  }

  const byCode = new Map(parcels.map((p) => [p.code, { ...p }]))
  for (const [shortCode, parcelCode] of opened) {
    const target = byCode.get(parcelCode)
    if (!target) {
      return {
        ok: false,
        error: `https://www.dpd.co.uk/d/${shortCode} is for a parcel that is not part of this delivery (${number}). Check it came from the right email.`,
      }
    }
    target.shortCode = shortCode
  }
  return { ok: true, consignment: { number, parcels: parcels.map((p) => byCode.get(p.code) ?? p) } }
}
