'use client'

import { useEffect, useRef, useState } from 'react'

// How long the shopper gets to read the warning before the handover happens
// anyway. Long enough to notice, short enough that nobody sat waiting for a
// payment page thinks the checkout has jammed.
const HOLD_SECONDS = 5

// Whether the storefront is currently drawn dark. The pre-paint script in the
// core layout always stamps data-theme on <html>, so that attribute is the
// answer; the media query is only the fallback for a page that somehow rendered
// without it.
export function isDarkTheme(): boolean {
  if (typeof document === 'undefined') return false
  const theme = document.documentElement.getAttribute('data-theme')
  if (theme === 'dark') return true
  if (theme === 'light') return false
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches === true
}

// Shown between "Place order" and a payment provider's own site, and only to a
// shopper on the dark storefront: the provider decides its own colours, and
// almost none of them do dark, so an unwarned shopper gets a screenful of white
// at the exact moment they are being asked to approve money. It never blocks the
// journey - the countdown hands them over on its own if they do nothing.
export function HandoverDarkModeNotice({ providerName, onContinue }: { providerName: string; onContinue: () => void }) {
  // Drives the width of the bar. It starts full and is flipped on the frame
  // after mount, so the CSS transition below has two values to run between.
  const [running, setRunning] = useState(false)
  const buttonRef = useRef<HTMLButtonElement>(null)
  // Held in a ref so the timer below never restarts when the parent re-renders,
  // and so a click and the countdown can never both navigate.
  const continueRef = useRef(onContinue)
  useEffect(() => { continueRef.current = onContinue }, [onContinue])
  const doneRef = useRef(false)

  useEffect(() => {
    // The button, not the dialog: the one thing to do here is press it, and a
    // keyboard shopper should not have to go looking for it.
    buttonRef.current?.focus()
    const frame = requestAnimationFrame(() => setRunning(true))
    const timer = setTimeout(() => {
      if (doneRef.current) return
      doneRef.current = true
      continueRef.current()
    }, HOLD_SECONDS * 1000)
    return () => { cancelAnimationFrame(frame); clearTimeout(timer) }
  }, [])

  function goNow() {
    if (doneRef.current) return
    doneRef.current = true
    continueRef.current()
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 10000, background: 'var(--color-overlay)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem',
      }}
    >
      {/* No click-outside and no Escape: there is nothing to cancel. The order
          is already made and the shopper is going to the provider either way,
          so the only choice on offer is whether to wait out the countdown. */}
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="shop-handover-title"
        aria-describedby="shop-handover-body"
        style={{
          background: 'var(--color-surface)', color: 'var(--color-text)', borderRadius: 8,
          width: '90vw', maxWidth: 420, padding: '1.25rem', display: 'grid', gap: '0.75rem',
          border: '1px solid var(--color-border)', boxShadow: '0 25px 50px -12px rgba(0,0,0,.45)',
        }}
      >
        <h2 id="shop-handover-title" style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>
          Bright screen ahead
        </h2>
        <p id="shop-handover-body" style={{ margin: 0, fontSize: '0.875rem', lineHeight: 1.5, color: 'var(--color-text-secondary)' }}>
          You are off to {providerName} to pay. Their site does not follow your dark mode,
          so it will arrive rather brighter than this one. Consider yourself warned.
        </p>
        {/* The countdown, drawn rather than counted: a bar draining left is read
            in a glance, which is all the attention a five second wait gets. */}
        <div
          aria-hidden="true"
          style={{ height: 4, borderRadius: 2, background: 'var(--color-bg-subtle)', overflow: 'hidden' }}
        >
          <div
            style={{
              height: '100%', width: running ? '0%' : '100%', background: 'var(--color-primary)',
              transition: `width ${HOLD_SECONDS}s linear`,
            }}
          />
        </div>
        <p style={{ margin: 0, fontSize: '0.8125rem', color: 'var(--color-text-muted)' }}>
          Taking you there in {HOLD_SECONDS} seconds.
        </p>
        <button
          ref={buttonRef}
          type="button"
          onClick={goNow}
          style={{
            background: 'var(--color-primary)', color: 'var(--color-on-primary)', border: '1px solid transparent',
            borderRadius: 8, padding: '0.625rem 1.25rem', fontWeight: 600, cursor: 'pointer',
          }}
        >
          Continue to {providerName}
        </button>
      </div>
    </div>
  )
}
