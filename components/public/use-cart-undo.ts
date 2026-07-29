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
import { type CartLine, cartLineKey, getCart, removeFromCart, restoreCartLine } from '@/modules/shop/components/public/cart'

const VISIBLE_MS = 5000
const FADE_MS = 300

type PendingRemoval = { line: CartLine; index: number; message: string }

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

  const removeLine = useCallback((key: string, name: string) => {
    const cart = getCart()
    const index = cart.findIndex((l) => cartLineKey(l) === key)
    const snapshot = index >= 0 ? cart[index] : undefined
    removeFromCart(key)
    if (!enabled || !snapshot) return
    clearTimers()
    pending.current = { line: snapshot, index, message: `Removed ${name}.` }
    setToast({ message: `Removed ${name}.`, leaving: false })
    timers.current.push(setTimeout(() => setToast((t) => (t ? { ...t, leaving: true } : null)), VISIBLE_MS))
    timers.current.push(setTimeout(() => { pending.current = null; setToast(null) }, VISIBLE_MS + FADE_MS))
  }, [enabled])

  const undo = useCallback(() => {
    const snapshot = pending.current
    dismiss()
    if (snapshot) restoreCartLine(snapshot.line, snapshot.index)
  }, [dismiss])

  return { toast, removeLine, undo }
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
