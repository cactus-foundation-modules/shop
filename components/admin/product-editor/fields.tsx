'use client'

import { useId, type ReactNode } from 'react'

/** Form primitives for the product editor. Every field gets a real <label>, an
 * optional hint and an inline error wired up through aria-describedby, so the
 * markup carries the same information the layout does. */

export function Section({ title, blurb, children, actions }: { title: string; blurb?: ReactNode; children: ReactNode; actions?: ReactNode }) {
  return (
    <section className="spe-section">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem' }}>
        <div style={{ minWidth: 0 }}>
          <h3 className="spe-section-head">{title}</h3>
          {blurb ? <p className="spe-section-blurb">{blurb}</p> : null}
        </div>
        {actions ? <div style={{ flexShrink: 0 }}>{actions}</div> : null}
      </div>
      {children}
    </section>
  )
}

export function Grid({ cols = 1, children }: { cols?: 1 | 2 | 3 | 4; children: ReactNode }) {
  return <div className={`spe-grid${cols > 1 ? ` spe-grid-${cols}` : ''}`}>{children}</div>
}

type FieldProps = {
  label: string
  hint?: ReactNode
  error?: string | null
  optional?: boolean
  /** Renders the control. Spread the supplied props onto it so labelling works. */
  children: (props: { id: string; 'aria-describedby': string | undefined; 'aria-invalid': boolean | undefined }) => ReactNode
  /** Live character counter, e.g. meta description length. */
  count?: { value: number; max: number }
}

export function Field({ label, hint, error, optional, children, count }: FieldProps) {
  const id = useId()
  const hintId = `${id}-hint`
  const errorId = `${id}-error`
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ') || undefined

  return (
    <div className="spe-field">
      <label className="spe-label" htmlFor={id}>
        {label}
        {optional ? <span className="spe-optional"> (optional)</span> : null}
      </label>
      {children({ id, 'aria-describedby': describedBy, 'aria-invalid': error ? true : undefined })}
      {count ? (
        <div className={`spe-count${count.value > count.max ? ' spe-count-over' : ''}`}>
          {count.value} / {count.max}
        </div>
      ) : null}
      {hint ? <p className="spe-hint" id={hintId}>{hint}</p> : null}
      {error ? <p className="spe-error" id={errorId} role="alert"><span aria-hidden>⚠</span>{error}</p> : null}
    </div>
  )
}

/** Text/number input with an optional unit prefix (currency) or suffix (kg, cm). */
export function Control({
  prefix, suffix, ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { prefix?: ReactNode; suffix?: ReactNode }) {
  const input = <input {...props} className="spe-control" />
  if (!prefix && !suffix) return input
  return (
    <span className="spe-prefixed">
      {prefix ? <span className="spe-prefix" aria-hidden>{prefix}</span> : null}
      {input}
      {suffix ? <span className="spe-suffix" aria-hidden>{suffix}</span> : null}
    </span>
  )
}

export function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className="spe-control" />
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className="spe-control" />
}

/** Checkbox with a bold label and a hint, for the "turn this behaviour on" rows. */
export function Switch({ checked, onChange, label, hint, disabled }: {
  checked: boolean
  onChange: (next: boolean) => void
  label: string
  hint?: ReactNode
  disabled?: boolean
}) {
  return (
    <label className="spe-switch">
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span className="spe-switch-text">
        <span className="spe-switch-label">{label}</span>
        {hint ? <span className="spe-switch-hint">{hint}</span> : null}
      </span>
    </label>
  )
}

/** The block a Switch reveals when it is on. */
export function Reveal({ children }: { children: ReactNode }) {
  return <div className="spe-reveal">{children}</div>
}

export function EmptyNote({ children }: { children: ReactNode }) {
  return <p className="spe-empty">{children}</p>
}
