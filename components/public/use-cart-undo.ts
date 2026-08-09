'use client'

// Two small behaviours both cart renderers share.
//
// useCartUndo: removing a line takes it out of the cart at once (the totals and
// the delivery summary have to be honest immediately), but keeps a snapshot of
// the line - quantity, meta and its place in the cart - for long enough that the
// shopper can put it straight back. The toast holds for five seconds, fades over
// a third of one, then goes.
//
// useOutOfView: true once the observed element has scrolled out of the viewport,
// which is what raises the sticky checkout bar. Without IntersectionObserver it
// simply stays false, so the bar never appears rather than appearing wrongly.
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import { type CartLine, cartLineKey, getCart, removeCartLines, removeFromCart, restoreCartLine, restoreCartLines } from '@/modules/shop/components/public/cart'

const VISIBLE_MS = 5000
const FADE_MS = 300

// One removal the toast can put back: a single line, or a whole group (a
// product and its accessories removed together). Either way the snapshots keep
// each line's place, so undo is a true undo.
type PendingRemoval = { snapshots: { line: CartLine; index: number }[]; message: string }

export function useCartUndo(enabled: boolean) {
  const [toast, setToast] = useState<{ message: string; leaving: boolean } | null>(null)
  const pending = useRef<PendingRemoval | null>(null)
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])

  const clearTimers = () => {
    timers.current.forEach((t) => clearTimeout(t))
    timers.current = []
  }
  useEffect(() => clearTimers, [])

  const dismiss = useCallback(() => {
    clearTimers()
    pending.current = null
    setToast(null)
  }, [])

  const raiseToast = useCallback((snapshots: { line: CartLine; index: number }[], message: string) => {
    if (!enabled || snapshots.length === 0) return
    clearTimers()
    pending.current = { snapshots, message }
    setToast({ message, leaving: false })
    timers.current.push(setTimeout(() => setToast((t) => (t ? { ...t, leaving: true } : null)), VISIBLE_MS))
    timers.current.push(setTimeout(() => { pending.current = null; setToast(null) }, VISIBLE_MS + FADE_MS))
  }, [enabled])

  const removeLine = useCallback((key: string, name: string) => {
    const cart = getCart()
    const index = cart.findIndex((l) => cartLineKey(l) === key)
    const snapshot = index >= 0 ? cart[index] : undefined
    removeFromCart(key)
    if (snapshot) raiseToast([{ line: snapshot, index }], `Removed ${name}.`)
  }, [raiseToast])

  // A whole group's removal in one write and one toast. The message is the
  // caller's ("Removed Impulse Desk and 2 accessories."), since only it knows
  // what the set was called.
  const removeLines = useCallback((keys: readonly string[], message: string) => {
    const cart = getCart()
    const set = new Set(keys)
    const snapshots = cart
      .map((line, index) => ({ line, index }))
      .filter(({ line }) => set.has(cartLineKey(line)))
    removeCartLines(keys)
    raiseToast(snapshots, message)
  }, [raiseToast])

  const undo = useCallback(() => {
    const removal = pending.current
    dismiss()
    if (!removal) return
    if (removal.snapshots.length === 1) {
      const only = removal.snapshots[0]!
      restoreCartLine(only.line, only.index)
    } else {
      restoreCartLines(removal.snapshots)
    }
  }, [dismiss])

  return { toast, removeLine, removeLines, undo }
}

export function useOutOfView(ref: RefObject<HTMLElement | null>, enabled: boolean): boolean {
  const [outOfView, setOutOfView] = useState(false)
  useEffect(() => {
    if (!enabled) return
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    // The bottom margin keeps the bar down until the totals are properly gone,
    // rather than flickering it on as they graze the fold.
    const io = new IntersectionObserver(
      (entries) => setOutOfView(!entries[0]!.isIntersecting),
      { rootMargin: '0px 0px -90px 0px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [ref, enabled])
  // Gated on the way out rather than reset inside the effect: while disabled
  // (an empty cart, the editor preview) the answer is simply "no", and the
  // observer re-reports the truth the moment it is enabled again.
  return enabled && outOfView
}
