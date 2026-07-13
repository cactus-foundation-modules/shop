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
const messageStyle: React.CSSProperties = { margin: 0, fontSize: '0.875rem', color: 'var(--color-text-muted)' }
const actionsStyle: React.CSSProperties = { display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }
const inputStyle: React.CSSProperties = {
  width: '100%', padding: '0.5rem 0.75rem', borderRadius: 6, border: '1px solid var(--color-border)',
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

export function useConfirm(): [(opts: ConfirmOptions | string) => Promise<boolean>, ReactNode] {
  const [state, setState] = useState<{ opts: ConfirmOptions; resolve: (v: boolean) => void } | null>(null)

  const confirm = useCallback((o: ConfirmOptions | string) => {
    const opts = typeof o === 'string' ? { message: o } : o
    return new Promise<boolean>((resolve) => setState({ opts, resolve }))
  }, [])

  function settle(value: boolean) {
    setState((prev) => { prev?.resolve(value); return null })
  }

  const node = state ? (
    <Dialog labelledBy="shop-confirm-title" onCancel={() => settle(false)}>
      <h3 id="shop-confirm-title" style={titleStyle}>{state.opts.title ?? 'Are you sure?'}</h3>
      <p style={messageStyle}>{state.opts.message}</p>
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
