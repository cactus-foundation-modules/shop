'use client'

import { useState, type CSSProperties, type InputHTMLAttributes } from 'react'

// A quantity box the shopper can actually empty. A controlled input bound
// straight to a number cannot hold "nothing": backspacing the 1 hands React an
// empty string, the handler turns it back into 1, and the box refuses to clear -
// so retyping meant selecting the digit and typing over it, which nobody guesses.
//
// Pattern: a draft string sits over the committed number while the box is being
// typed in. Every non-empty edit commits straight away (so the basket and any
// listener stay current as before); an empty box commits nothing and simply
// waits. On blur the draft is dropped and the box shows the committed figure
// again - so walking away from an empty box puts back what was there.
export function QuantityInput({
  value, min = 1, onCommit, className, style, ariaLabel, readOnly, type = 'text', inputProps,
}: {
  value: number
  min?: number
  onCommit: (next: number) => void
  className?: string
  style?: CSSProperties
  ariaLabel: string
  readOnly?: boolean
  type?: 'text' | 'number'
  inputProps?: Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'onBlur' | 'type'>
}) {
  const floor = Number.isFinite(min) && min > 1 ? Math.floor(min) : 1
  const [draft, setDraft] = useState<string | null>(null)
  return (
    <input
      {...inputProps}
      type={type}
      inputMode="numeric"
      className={className}
      style={style}
      aria-label={ariaLabel}
      readOnly={readOnly}
      value={draft ?? String(value)}
      onChange={(e) => {
        const digits = e.target.value.replace(/[^0-9]/g, '')
        setDraft(digits)
        if (digits !== '') onCommit(Math.max(floor, Number(digits)))
      }}
      onBlur={() => setDraft(null)}
    />
  )
}
