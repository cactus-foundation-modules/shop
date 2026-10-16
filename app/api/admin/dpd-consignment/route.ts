import { NextRequest, NextResponse } from 'next/server'
import { requireShopUser } from '@/modules/shop/lib/access'
import { dpdParcelCodeFromUrl } from '@/modules/shop/lib/tracking/dpd'
import { dpdFollowLinkCode } from '@/modules/shop/lib/tracking/dpd-follow-link'
import { mintDpdSession } from '@/modules/shop/lib/tracking/dpd-session'
import { findDpdConsignment, type DpdConsignment } from '@/modules/shop/lib/tracking/dpd-consignment'

// PROTECTED - "how many boxes is this DPD delivery?", asked by the dispatch
// and parcel forms the moment a DPD link is pasted in, so the form can show
// every box and a place for each one's own link before anything is saved.
//
// Read-only and saves nothing: the dispatch route checks the links again,
// against DPD, when the parcel is actually recorded. A follow-my-parcel link
// costs one of DPD's five session checks a minute to resolve, so answers are
// remembered for a few minutes per link - a form re-rendering, or somebody
// opening the same parcel twice, does not spend another.

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

async function ask(link: string): Promise<Answer> {
  const shortCode = dpdFollowLinkCode(link)
  let parcelCode = dpdParcelCodeFromUrl(link)
  if (!parcelCode && shortCode) {
    const session = await mintDpdSession(shortCode)
    parcelCode = session?.parcelCode ?? null
    if (!parcelCode) {
      return { found: false, error: 'DPD did not recognise that link just now. It can still be saved - the tracking check finds the other parcels later.' }
    }
  }
  if (!parcelCode) return { found: false, error: 'That is not a DPD tracking link.' }

  const consignment = await findDpdConsignment(parcelCode)
  if (!consignment) return { found: false, error: 'DPD could not be reached to count the parcels just now.' }
  return { found: true, consignmentNumber: consignment.consignmentNumber, parcelCode, parcels: consignment.boxes }
}

export async function GET(request: NextRequest) {
  const gate = await requireShopUser('shop.orders')
  if (gate.error) return gate.error

  const link = request.nextUrl.searchParams.get('link')?.trim() ?? ''
  if (!link || link.length > 2000) return NextResponse.json({ found: false, error: 'No DPD link was given.' }, { status: 400 })

  const key = dpdFollowLinkCode(link) ?? dpdParcelCodeFromUrl(link) ?? link
  const hit = remembered.get(key)
  if (hit && Date.now() - hit.at < REMEMBER_MS) return NextResponse.json(hit.answer)

  const answer = await ask(link)
  // A failure is not remembered: it is usually DPD's minute running out, and
  // the next paste should ask again.
  return NextResponse.json(answer.found ? remember(key, answer) : answer)
}
