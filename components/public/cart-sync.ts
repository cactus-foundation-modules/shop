'use client'

// Cross-device basket for signed-in shoppers.
//
// The cart itself stays exactly where it was - localStorage, read synchronously,
// rendered with no round-trip, guests included (see cart.ts). This layer sits
// beside it and, for a signed-in member only, keeps that local copy and the
// server's row in step: merge on sign-in, push on every change, pull when the
// tab comes back to the front. Add something on the phone, open the laptop, and
// the basket is already there.
//
// Everything here fails silently. A basket that cannot reach the server is a
// basket that behaves exactly as it did before this file existed, which is the
// only acceptable way for a sync layer to break.

import { applyServerCart, getCart, subscribeCart, type CartLine } from '@/modules/shop/components/public/cart'

const ENDPOINT = '/api/m/shop/member/cart'
// Which member the local copy belongs to. '' (or absent) means a guest basket.
// Without it, signing out would leave one shopper's basket sitting in the next
// one's browser, and signing in on a shared laptop would quietly adopt it.
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

async function push(): Promise<void> {
  if (mode !== 'member') return
  const lines = getCart()
  try {
    const res = await fetch(ENDPOINT, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lines }),
    })
    if (res.status === 401) {
      // Signed out mid-session. Leave the basket alone - the shopper is looking
      // at it - and stop syncing until the next page load says otherwise.
      mode = 'guest'
      return
    }
    if (!res.ok) return
    const data = (await res.json()) as { updatedAt?: string }
    if (data?.updatedAt) writeLocal(STAMP_KEY, data.updatedAt)
    writeLocal(OWNER_KEY, memberId)
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
  if (mode === 'guest') return
  if (pushTimer) clearTimeout(pushTimer)
  pushTimer = setTimeout(() => {
    pushTimer = null
    void push()
  }, PUSH_DEBOUNCE_MS)
}

async function pull(): Promise<void> {
  lastPullAt = Date.now()
  let res: Response
  try {
    res = await fetch(ENDPOINT, { headers: { Accept: 'application/json' } })
  } catch {
    return
  }

  if (res.status === 401) {
    const previousOwner = readLocal(OWNER_KEY)
    mode = 'guest'
    memberId = ''
    // The basket in this browser belongs to a member who is no longer signed
    // in. It is safe on the server; leaving a copy behind on what may well be a
    // shared machine is not.
    if (previousOwner) {
      adopt([], '')
      writeLocal(OWNER_KEY, '')
      writeLocal(STAMP_KEY, '')
    }
    return
  }
  if (!res.ok) return

  let data: { memberId?: string; lines?: CartLine[]; updatedAt?: string | null }
  try {
    data = await res.json()
  } catch {
    return
  }
  if (!data?.memberId) return

  mode = 'member'
  memberId = data.memberId
  const serverLines = Array.isArray(data.lines) ? data.lines : []
  const serverStamp = data.updatedAt ?? ''
  const owner = readLocal(OWNER_KEY)
  const local = getCart()

  // Somebody else's basket in this browser (a shared machine, a second account).
  // Theirs is on the server where they left it; ours is the one to show.
  if (owner && owner !== memberId) {
    adopt(serverLines, serverStamp)
    writeLocal(OWNER_KEY, memberId)
    pending = false
    return
  }

  // Signing in with a basket built as a guest, or the very first sign-in on
  // this device: the two baskets become one, and the result goes up.
  if (!owner || !serverStamp) {
    const merged = mergeCarts(local, serverLines)
    adopt(merged, serverStamp)
    writeLocal(OWNER_KEY, memberId)
    // Even when the merge changed nothing locally, the server may not have this
    // basket yet, so the push is unconditional.
    pending = true
    await push()
    return
  }

  // Same member, same device. A stamp we have not seen means the basket moved
  // on somewhere else; an unpushed local change here outranks it, because this
  // is the tab the shopper is actually holding.
  if (serverStamp !== readLocal(STAMP_KEY)) {
    if (pending) await push()
    else {
      adopt(serverLines, serverStamp)
      writeLocal(OWNER_KEY, memberId)
    }
    return
  }

  writeLocal(OWNER_KEY, memberId)
  if (pending) await push()
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
    if (mode === 'guest') return
    if (Date.now() - lastPullAt < PULL_THROTTLE_MS) return
    pullOnce()
  })

  // A basket change made seconds ago must not be lost to a closing tab, so the
  // debounce is short-circuited on the way out. keepalive lets the request
  // outlive the page.
  window.addEventListener('pagehide', () => {
    if (mode !== 'member' || !pending) return
    if (pushTimer) {
      clearTimeout(pushTimer)
      pushTimer = null
    }
    try {
      const blob = new Blob([JSON.stringify({ lines: getCart() })], { type: 'application/json' })
      void fetch(ENDPOINT, { method: 'PUT', body: blob, keepalive: true })
    } catch {
      // Nothing else to try at this point in a page's life.
    }
  })

  pullOnce()
}
