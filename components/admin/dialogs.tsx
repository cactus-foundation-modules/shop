'use client'

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'

// In-app replacements for the browser's confirm()/prompt()/alert() in the shop
// admin. Each hook returns [invoke, node]: call invoke(...) to open the dialog
// and await the result, and render {node} once anywhere in the screen. The
// styling matches the module's other overlays (RefundModal/ImportModal) and uses
// colour tokens only. Escape cancels, Enter confirms.

const overlayStyle: React.CSSProperties = {
  position: 'fixed', inset: 0, zIndex: 10000, background: 'var(--color-overlay)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem',
}
const cardStyle: React.CSSProperties = {
  background: 'var(--color-surface)', borderRadius: 8, width: '90vw', maxWidth: 440,
  boxShadow: '0 25px 50px -12px rgba(0,0,0,.25)', display: 'grid', gap: '1rem', padding: '1.25rem',
}
const titleStyle: React.CSSProperties = { margin: 0, fontSize: '1rem', fontWeight: 600 }
const messageStyle: React.CSSProperties = { margin: 0, fontSize: '0.875rem', color: 'var(--color-text-secondary)' }
const actionsStyle: React.CSSProperties = { display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }
const inputStyle: React.CSSProperties = {
  width: '100%', padding: '0.5rem 0.75rem', borderRadius: 6, border: '1px solid var(--color-border)',
}
const checkboxRowStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'flex-start', gap: '0.5rem', cursor: 'pointer',
  padding: '0.625rem 0.75rem', borderRadius: 6, border: '1px solid var(--color-border)',
  background: 'var(--color-bg-subtle)',
}
const checkboxHintStyle: React.CSSProperties = {
  display: 'block', marginTop: '0.15rem', fontSize: '0.8125rem', color: 'var(--color-text-secondary)',
}

function Dialog({ labelledBy, onCancel, children }: { labelledBy: string; onCancel: () => void; children: ReactNode }) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onCancel() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])
  return (
    <div style={overlayStyle} onClick={(e) => e.target === e.currentTarget && onCancel()}>
      <div role="dialog" aria-modal="true" aria-labelledby={labelledBy} style={cardStyle}>
        {children}
      </div>
    </div>
  )
}

// --- Confirm ---------------------------------------------------------------

type ConfirmOptions = { title?: string; message: string; confirmLabel?: string; cancelLabel?: string; danger?: boolean }

/** A single tick box carried on the dialog, for the decisions that come with a
 *  rider - "and email the customer about it". Kept to one on purpose: a dialog
 *  with a form on it is a screen, not a confirmation. */
type ConfirmCheckbox = { label: string; hint?: string; defaultChecked?: boolean }
type ConfirmOptionsWithCheckbox = ConfirmOptions & { checkbox: ConfirmCheckbox }

/** What a confirmed tick-box dialog resolves to. Cancelling resolves null, so
 *  the usual `if (!(await confirm(...))) return` guard reads the same either way. */
export type ConfirmChoice = { checked: boolean }

interface ConfirmFn {
  (opts: ConfirmOptionsWithCheckbox): Promise<ConfirmChoice | null>
  (opts: ConfirmOptions | string): Promise<boolean>
}

export function useConfirm(): [ConfirmFn, ReactNode] {
  const [state, setState] = useState<{
    opts: ConfirmOptions & { checkbox?: ConfirmCheckbox }
    resolve: (v: boolean | ConfirmChoice | null) => void
  } | null>(null)
  const [checked, setChecked] = useState(true)

  const openConfirm = useCallback((o: ConfirmOptionsWithCheckbox | ConfirmOptions | string) => {
    const opts: ConfirmOptions & { checkbox?: ConfirmCheckbox } = typeof o === 'string' ? { message: o } : o
    setChecked(opts.checkbox?.defaultChecked ?? true)
    return new Promise<boolean | ConfirmChoice | null>((resolve) => setState({ opts, resolve }))
  }, [])
  // One implementation, two shapes of answer: a plain dialog resolves the
  // boolean every existing call site already reads, a tick-box one resolves the
  // choice (or null when cancelled, so `if (!result) return` still holds).
  const confirm = openConfirm as ConfirmFn

  function settle(confirmed: boolean) {
    setState((prev) => {
      if (!prev) return null
      if (prev.opts.checkbox) prev.resolve(confirmed ? { checked } : null)
      else prev.resolve(confirmed)
      return null
    })
  }

  const checkbox = state?.opts.checkbox
  const node = state ? (
    <Dialog labelledBy="shop-confirm-title" onCancel={() => settle(false)}>
      <h3 id="shop-confirm-title" style={titleStyle}>{state.opts.title ?? 'Are you sure?'}</h3>
      <p style={messageStyle}>{state.opts.message}</p>
      {checkbox && (
        <label style={checkboxRowStyle}>
          <input
            type="checkbox"
            checked={checked}
            onChange={(e) => setChecked(e.target.checked)}
            style={{ marginTop: '0.15rem' }}
          />
          <span>
            <span style={{ fontSize: '0.875rem' }}>{checkbox.label}</span>
            {checkbox.hint && <span style={checkboxHintStyle}>{checkbox.hint}</span>}
          </span>
        </label>
      )}
      <div style={actionsStyle}>
        <button type="button" className="btn btn-secondary" onClick={() => settle(false)}>{state.opts.cancelLabel ?? 'Cancel'}</button>
        <button
          type="button"
          className={state.opts.danger === false ? 'btn btn-primary' : 'btn btn-danger'}
          autoFocus
          onClick={() => settle(true)}
        >
          {state.opts.confirmLabel ?? 'Delete'}
        </button>
      </div>
    </Dialog>
  ) : null

  return [confirm, node]
}

// --- Prompt ----------------------------------------------------------------

type PromptOptions = { title?: string; message?: string; defaultValue?: string; confirmLabel?: string; placeholder?: string }

export function usePrompt(): [(opts: PromptOptions | string) => Promise<string | null>, ReactNode] {
  const [state, setState] = useState<{ opts: PromptOptions; resolve: (v: string | null) => void } | null>(null)
  const [value, setValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const prompt = useCallback((o: PromptOptions | string) => {
    const opts = typeof o === 'string' ? { title: o } : o
    setValue(opts.defaultValue ?? '')
    return new Promise<string | null>((resolve) => setState({ opts, resolve }))
  }, [])

  function settle(result: string | null) {
    setState((prev) => { prev?.resolve(result); return null })
  }

  function submit() {
    const trimmed = value.trim()
    settle(trimmed === '' ? null : trimmed)
  }

  useEffect(() => { if (state) inputRef.current?.focus() }, [state])

  const node = state ? (
    <Dialog labelledBy="shop-prompt-title" onCancel={() => settle(null)}>
      <h3 id="shop-prompt-title" style={titleStyle}>{state.opts.title ?? 'Enter a value'}</h3>
      {state.opts.message && <p style={messageStyle}>{state.opts.message}</p>}
      <input
        ref={inputRef}
        value={value}
        placeholder={state.opts.placeholder}
        aria-label={state.opts.title ?? 'Value'}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') submit() }}
        style={inputStyle}
      />
      <div style={actionsStyle}>
        <button type="button" className="btn btn-secondary" onClick={() => settle(null)}>Cancel</button>
        <button type="button" className="btn btn-primary" disabled={value.trim() === ''} onClick={submit}>{state.opts.confirmLabel ?? 'Save'}</button>
      </div>
    </Dialog>
  ) : null

  return [prompt, node]
}

// --- Alert -----------------------------------------------------------------

export function useAlert(): [(message: string, title?: string) => Promise<void>, ReactNode] {
  const [state, setState] = useState<{ message: string; title?: string; resolve: () => void } | null>(null)

  const showAlert = useCallback((message: string, title?: string) => {
    return new Promise<void>((resolve) => setState({ message, title, resolve }))
  }, [])

  function settle() {
    setState((prev) => { prev?.resolve(); return null })
  }

  const node = state ? (
    <Dialog labelledBy="shop-alert-title" onCancel={settle}>
      <h3 id="shop-alert-title" style={titleStyle}>{state.title ?? 'Heads up'}</h3>
      <p style={messageStyle}>{state.message}</p>
      <div style={actionsStyle}>
        <button type="button" className="btn btn-primary" autoFocus onClick={settle}>OK</button>
      </div>
    </Dialog>
  ) : null

  return [showAlert, node]
}
