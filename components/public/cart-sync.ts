'use client'

// The basket, kept on the server as well as in the browser.
//
// The cart itself stays exactly where it was - localStorage, read synchronously,
// rendered with no round-trip (see cart.ts). This layer sits beside it and keeps
// that local copy and the server's row in step: push on every change, pull when
// the tab comes back to the front, merge when the two are genuinely different
// baskets. Add something on the phone, open the laptop, and the basket is
// already there.
//
// Both kinds of shopper are synced, to different endpoints:
//
//   signed in - /api/m/shop/member/cart, keyed on their account, which is what
//               carries a basket from one device to another.
//   guest     - /api/m/shop/public/cart/store, keyed on the id in the shop's own
//               basket cookie. Same device only, by design: the cookie is the
//               strictly-necessary shopping-basket one and it identifies a
//               basket, not a person.
//
// Which of the two applies is worked out once, by asking the guest endpoint: it
// answers an empty 204 to anybody signed in. After that the answer is
// remembered, so a member's later pulls go straight to their account.
//
// Guest rows hold lines and nothing else. Anything typed into the checkout stays
// in this browser until an order is placed, so nothing here needs a banner and
// nothing here is any use for remembering a shopper.
//
// Everything here fails silently. A basket that cannot reach the server is a
// basket that behaves exactly as it did before this file existed, which is the
// only acceptable way for a sync layer to break.

import { applyServerCart, getCart, subscribeCart, type CartLine } from '@/modules/shop/components/public/cart'

const MEMBER_ENDPOINT = '/api/m/shop/member/cart'
const GUEST_ENDPOINT = '/api/m/shop/public/cart/store'
// Whose the local copy is: a member id, or this for a basket held under the
// shop's basket cookie. '' (or absent) means it has never synced.
//
// Without it, signing out would leave one shopper's basket sitting in the next
// one's browser, and signing in on a shared laptop would quietly adopt it. The
// guest side deliberately stores this word rather than the cart id: the browser
// only needs to spot the handover at sign-in, and the id itself is httpOnly and
// stays that way.
const GUEST_OWNER = 'guest'
const OWNER_KEY = 'cactus_shop_cart_owner'
// The server stamp the local copy is level with. A different stamp coming back
// means the other device has moved on.
const STAMP_KEY = 'cactus_shop_cart_synced'

// Long enough that a shopper hammering the quantity stepper sends one write
// rather than eight, short enough that picking the other device straight up
// still finds the change.
const PUSH_DEBOUNCE_MS = 600
// Floor on how often coming back to the tab costs a round-trip.
const PULL_THROTTLE_MS = 15_000

type Mode = 'unknown' | 'guest' | 'member'

let started = false
let mode: Mode = 'unknown'
let memberId = ''
// A local change made since the last successful push. While this is set the
// local copy wins any disagreement: this tab is where the shopper actually is.
let pending = false
let pushTimer: ReturnType<typeof setTimeout> | null = null
let lastPullAt = 0
let inFlight: Promise<void> | null = null

function readLocal(key: string): string {
  try {
    return window.localStorage.getItem(key) ?? ''
  } catch {
    return ''
  }
}

function writeLocal(key: string, value: string): void {
  try {
    if (value) window.localStorage.setItem(key, value)
    else window.localStorage.removeItem(key)
  } catch {
    // Private browsing with storage denied - sync simply stops being on offer.
  }
}

const lineKey = (l: CartLine) => l.lineId ?? l.productId

// Union of the two baskets, local order first. A line in both keeps the LARGER
// quantity rather than the sum: the usual reason a line is in both is that this
// very device put it in each, and a shopper who has never asked for six of
// anything should not find six of it after signing in.
export function mergeCarts(local: CartLine[], server: CartLine[]): CartLine[] {
  const merged = local.map((l) => ({ ...l }))
  const byKey = new Map(merged.map((l) => [lineKey(l), l]))
  for (const line of server) {
    const hit = byKey.get(lineKey(line))
    if (hit) hit.quantity = Math.max(hit.quantity, line.quantity)
    else merged.push({ ...line })
  }
  return merged
}

// Local storage is written without the sync layer hearing its own echo, or
// every pull would schedule a push of what we were just handed.
let applying = false

function adopt(lines: CartLine[], stamp: string): void {
  applying = true
  try {
    applyServerCart(lines)
  } finally {
    applying = false
  }
  writeLocal(STAMP_KEY, stamp)
}

function endpointFor(m: Mode): string {
  return m === 'member' ? MEMBER_ENDPOINT : GUEST_ENDPOINT
}

/** The word written into OWNER_KEY for whatever this browser is currently
 *  syncing as. */
function ownerFor(m: Mode): string {
  return m === 'member' ? memberId : GUEST_OWNER
}

async function push(): Promise<void> {
  if (mode === 'unknown') return
  const at = mode
  const lines = getCart()
  try {
    const res = await fetch(endpointFor(at), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lines }),
    })
    // 401 from the member endpoint is a session that ended mid-visit; 409 from
    // the guest one is a sign-in that landed between the decision and the
    // request - the write keeps its error status precisely because it is one.
    // Either way this basket is now somebody else's business: leave it alone -
    // the shopper is looking at it - and let the next pull sort out who owns it.
    if (res.status === 401 || res.status === 409) {
      mode = 'unknown'
      return
    }
    if (!res.ok) return
    const data = (await res.json()) as { updatedAt?: string }
    if (data?.updatedAt) writeLocal(STAMP_KEY, data.updatedAt)
    writeLocal(OWNER_KEY, ownerFor(at))
    pending = false
  } catch {
    // Offline or blocked. `pending` stays set, so the next change or the next
    // visit to this tab tries again with the newer basket anyway.
  }
}

function schedulePush(): void {
  if (applying) return
  pending = true
  if (mode === 'unknown') return
  if (pushTimer) clearTimeout(pushTimer)
  pushTimer = setTimeout(() => {
    pushTimer = null
    void push()
  }, PUSH_DEBOUNCE_MS)
}

// The half of a pull that is the same whoever the shopper is: this browser is
// holding one basket, the server has just handed back another, and something has
// to decide which survives.
//
// Returns true when a guest basket was folded into an account, because that is
// the one outcome with tidying up left to do.
async function reconcile(now: string, serverLines: CartLine[], serverStamp: string): Promise<boolean> {
  const held = readLocal(OWNER_KEY)
  const local = getCart()

  // A guest basket meeting the account it has just signed into. Two genuinely
  // different baskets belonging to the same person, so they become one - this is
  // the shopper who filled a basket, then remembered they had an account.
  const signingIn = held === GUEST_OWNER && now !== GUEST_OWNER

  // Somebody else's basket in this browser: a second account, or the one left
  // behind by whoever has just signed out. Theirs is on the server where they
  // left it; ours is the one to show.
  if (held && held !== now && !signingIn) {
    adopt(serverLines, serverStamp)
    writeLocal(OWNER_KEY, now)
    pending = false
    return false
  }

  // Signing in with a basket built as a guest, the very first sync this browser
  // has ever done, or a server that has no row for us yet: the two become one,
  // and the result goes up.
  if (!held || signingIn || !serverStamp) {
    const merged = mergeCarts(local, serverLines)
    adopt(merged, serverStamp)
    writeLocal(OWNER_KEY, now)
    // Even when the merge changed nothing locally, the server may not have this
    // basket yet, so the push is unconditional.
    pending = true
    await push()
    return signingIn
  }

  // Same owner, same device. A stamp we have not seen means the basket moved on
  // somewhere else; an unpushed local change here outranks it, because this is
  // the tab the shopper is actually holding.
  if (serverStamp !== readLocal(STAMP_KEY)) {
    if (pending) await push()
    else {
      adopt(serverLines, serverStamp)
      writeLocal(OWNER_KEY, now)
    }
    return false
  }

  writeLocal(OWNER_KEY, now)
  if (pending) await push()
  return false
}

async function pull(): Promise<void> {
  lastPullAt = Date.now()

  // Once this browser is known to be signed in, ask the account's endpoint and
  // nothing else. The probe below is how we found that out in the first place,
  // and repeating it on every pull spent a wasted round-trip per visit to the
  // tab telling us what we already knew.
  //
  // A false answer means the account is no longer there - signed out in this
  // very tab, without a page load. That falls straight through to the probe
  // below rather than waiting for the next pull, so the basket left behind is
  // cleared in the same pass it always was.
  if (mode === 'member' && (await pullMember())) return

  // The guest endpoint first, even though the member one is the richer answer.
  // Most shoppers are guests, and that endpoint says so in the same breath as
  // handing back the basket - a signed-in shopper gets an empty 204 and we go
  // and ask properly. Asking the member endpoint first would have cost every
  // guest on every page load a 401 they were always going to get.
  //
  // Nothing is decided about this browser until the answer comes back. In
  // particular the basket on screen is left exactly as it is: a shopper who has
  // signed out since the last sync gets their local copy replaced by the guest
  // row in reconcile, which is the same clearing-out the old 401 branch did and
  // happens at the point we actually know it applies.
  let res: Response
  try {
    res = await fetch(GUEST_ENDPOINT, { headers: { Accept: 'application/json' } })
  } catch {
    mode = 'unknown'
    return
  }

  // 204 is a signed-in shopper. 409 is the same news from a shop whose server
  // half has not been updated yet, and is kept for exactly as long as a browser
  // might still be holding the older bundle. Nothing to fall through to here:
  // signing out between these two requests is the next pull's business, and the
  // basket on screen is left alone in the meantime.
  if (res.status === 204 || res.status === 409) {
    await pullMember()
    return
  }
  if (!res.ok) {
    mode = 'unknown'
    return
  }

  mode = 'guest'
  memberId = ''

  let data: { lines?: CartLine[]; updatedAt?: string | null }
  try {
    data = await res.json()
  } catch {
    return
  }

  await reconcile(GUEST_OWNER, Array.isArray(data.lines) ? data.lines : [], data.updatedAt ?? '')
}

/** True when there really is an account behind this browser, whatever came of
 *  the sync itself. False is the one answer the caller acts on: nobody is signed
 *  in, so whoever asked should go and ask the guest endpoint instead. */
async function pullMember(): Promise<boolean> {
  let res: Response
  try {
    res = await fetch(MEMBER_ENDPOINT, { headers: { Accept: 'application/json' } })
  } catch {
    mode = 'unknown'
    return false
  }
  // Signed out - either between the two requests, or in this tab since the last
  // pull. Either way this browser is a guest now.
  if (!res.ok) {
    mode = 'unknown'
    return false
  }

  let data: { memberId?: string; lines?: CartLine[]; updatedAt?: string | null }
  try {
    data = await res.json()
  } catch {
    // The session is real, the answer was not readable. Nothing is decided and
    // nothing is re-asked: a guest read here would be answering a question
    // nobody has established applies.
    return true
  }
  if (!data?.memberId) return true

  mode = 'member'
  memberId = data.memberId
  const foldedIn = await reconcile(
    memberId,
    Array.isArray(data.lines) ? data.lines : [],
    data.updatedAt ?? '',
  )

  // The guest copy is now part of the account. Drop it, and the cookie with it,
  // so signing out on a shared machine leaves the next person nothing and a
  // later sign-in cannot merge the same lines back in.
  if (foldedIn) await discardGuestCart()
  return true
}

async function discardGuestCart(): Promise<void> {
  try {
    await fetch(GUEST_ENDPOINT, { method: 'DELETE' })
  } catch {
    // The row is swept on age anyway, and the worst a survivor costs is one
    // extra merge if this browser signs in again.
  }
}

function pullOnce(): void {
  if (inFlight) return
  inFlight = pull().finally(() => {
    inFlight = null
  })
}

// Called by the cart itself the first time anything reads or writes it, so no
// storefront component has to remember to mount a syncing component - a header
// that happens not to carry a basket widget would silently opt the whole page
// out otherwise.
export function ensureCartSync(): void {
  if (started || typeof window === 'undefined') return
  started = true

  subscribeCart(schedulePush)

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return
    if (Date.now() - lastPullAt < PULL_THROTTLE_MS) return
    pullOnce()
  })

  // A basket change made seconds ago must not be lost to a closing tab, so the
  // debounce is short-circuited on the way out. keepalive lets the request
  // outlive the page.
  window.addEventListener('pagehide', () => {
    if (mode === 'unknown' || !pending) return
    if (pushTimer) {
      clearTimeout(pushTimer)
      pushTimer = null
    }
    try {
      const blob = new Blob([JSON.stringify({ lines: getCart() })], { type: 'application/json' })
      void fetch(endpointFor(mode), { method: 'PUT', body: blob, keepalive: true })
    } catch {
      // Nothing else to try at this point in a page's life.
    }
  })

  pullOnce()
}
