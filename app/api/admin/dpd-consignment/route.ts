import { NextRequest, NextResponse } from 'next/server'
import { requireShopUser } from '@/modules/shop/lib/access'
import { dpdParcelCodeFromUrl } from '@/modules/shop/lib/tracking/dpd'
import { dpdFollowLinkCode } from '@/modules/shop/lib/tracking/dpd-follow-link'
import { mintDpdSession } from '@/modules/shop/lib/tracking/dpd-session'
import { findDpdConsignment, findDpdParcelByNumber, type DpdConsignment } from '@/modules/shop/lib/tracking/dpd-consignment'

// PROTECTED - "how many boxes is this DPD delivery?", asked by the dispatch
// and parcel forms the moment a DPD link is pasted in, so the form can show
// every box and a place for each one's own link before anything is saved.
//
// Read-only and saves nothing: the dispatch route checks the links again,
// against DPD, when the parcel is actually recorded. A follow-my-parcel link
// costs one of DPD's five session checks an hour to resolve, so answers are
// remembered for a few minutes per link - a form re-rendering, or somebody
// opening the same parcel twice, does not spend another. When DPD will not
// open the link, the parcel number typed beside it finds the delivery
// anonymously instead (findDpdParcelByNumber), which DPD do not ration.

const REMEMBER_MS = 10 * 60 * 1000
const REMEMBER_MAX = 50

type Answer =
  | { found: true; consignmentNumber: string; parcelCode: string; parcels: DpdConsignment['boxes'] }
  | { found: false; error: string }

const remembered = new Map<string, { at: number; answer: Answer }>()

function remember(key: string, answer: Answer): Answer {
  if (remembered.size >= REMEMBER_MAX) {
    const oldest = remembered.keys().next().value
    if (oldest !== undefined) remembered.delete(oldest)
  }
  remembered.set(key, { at: Date.now(), answer })
  return answer
}

async function ask(link: string, number: string): Promise<Answer> {
  const shortCode = dpdFollowLinkCode(link)
  let parcelCode = dpdParcelCodeFromUrl(link)
  // Only a box DPD opened for this link is the box the link is for.
  let linked: string | null = null
  if (!parcelCode && shortCode) {
    parcelCode = (await mintDpdSession(shortCode))?.parcelCode ?? null
    linked = parcelCode
  }
  const byNumber = parcelCode ? null : await findDpdParcelByNumber(number, new Date())
  parcelCode ??= byNumber?.code ?? null
  if (!parcelCode) {
    return shortCode
      ? { found: false, error: 'DPD would not check that link just now. It can still be saved - put a parcel number in the tracking number box and the parcels are found without it, or the tracking check finds them later.' }
      : { found: false, error: 'That is not a DPD tracking link or parcel number.' }
  }

  const consignment = await findDpdConsignment(parcelCode, byNumber?.payload)
  if (!consignment) return { found: false, error: 'DPD could not be reached to count the parcels just now.' }
  return { found: true, consignmentNumber: consignment.consignmentNumber, parcelCode: linked ?? '', parcels: consignment.boxes }
}

export async function GET(request: NextRequest) {
  const gate = await requireShopUser('shop.orders')
  if (gate.error) return gate.error

  const link = request.nextUrl.searchParams.get('link')?.trim() ?? ''
  const number = request.nextUrl.searchParams.get('number')?.trim() ?? ''
  if ((!link && !number) || link.length > 2000 || number.length > 100) {
    return NextResponse.json({ found: false, error: 'No DPD link was given.' }, { status: 400 })
  }

  const key = `${dpdFollowLinkCode(link) ?? dpdParcelCodeFromUrl(link) ?? link}|${number}`
  const hit = remembered.get(key)
  if (hit && Date.now() - hit.at < REMEMBER_MS) return NextResponse.json(hit.answer)

  const answer = await ask(link, number)
  // A failure is not remembered: it is usually DPD's ration running out, and
  // the next paste should ask again.
  return NextResponse.json(answer.found ? remember(key, answer) : answer)
}
