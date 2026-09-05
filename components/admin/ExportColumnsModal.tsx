'use client'

import { useMemo, useState } from 'react'

export type ExportColumnOption = { key: string; label: string; hint?: string }
export type ExportColumnGroup = { label: string; columns: readonly ExportColumnOption[] }

// Generic "which columns do you want?" step in front of a CSV download. Shop's
// Products export uses it, and so does shop-variations' Variations export - the
// two column lists have nothing in common, so the modal knows about neither and
// is handed its groups, its storage key and a function that turns the chosen
// keys into the download url.
//
// The choice is kept in localStorage rather than the database: it is a per-person
// habit ("I only ever want codes and categories"), not shop configuration, and
// storing it needs no table, no migration and no permission of its own. It can
// come back empty (private window, cleared site data, a different browser) and in
// some contexts reading it throws, so every read and write is guarded and the
// fallback is "everything ticked".
function readStored(storageKey: string, valid: Set<string>): string[] | null {
  try {
    const raw = window.localStorage.getItem(storageKey)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return null
    const kept = parsed.filter((k): k is string => typeof k === 'string' && valid.has(k))
    return kept.length > 0 ? kept : null
  } catch {
    return null
  }
}

function writeStored(storageKey: string, keys: string[]): void {
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(keys))
  } catch {
    // A browser refusing to store the preference is not a reason to refuse the
    // download - the export still runs, it just won't be remembered next time.
  }
}

export function ExportColumnsModal({
  title, groups, storageKey, buildHref, onClose, description, requiredKeys = [],
}: {
  title: string
  groups: readonly ExportColumnGroup[]
  /** localStorage key holding the last chosen keys for this particular export. */
  storageKey: string
  /** Turns the chosen keys (in group order) into the download url. */
  buildHref: (keys: string[]) => string
  onClose: () => void
  description?: string
  /** Keys that cannot be unticked - the ones an import needs to match a row back. */
  requiredKeys?: readonly string[]
}) {
  const allKeys = useMemo(() => groups.flatMap((g) => g.columns.map((c) => c.key)), [groups])
  const required = useMemo(() => new Set(requiredKeys), [requiredKeys])

  // Read the stored choice once, on first render, rather than in an effect: an
  // effect would paint every box ticked and then visibly re-tick them.
  const [selected, setSelected] = useState<Set<string>>(() => {
    const stored = typeof window === 'undefined' ? null : readStored(storageKey, new Set(allKeys))
    return new Set(stored ?? allKeys)
  })

  const chosen = useMemo(() => allKeys.filter((k) => selected.has(k) || required.has(k)), [allKeys, selected, required])

  function toggle(key: string) {
    if (required.has(key)) return
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function setGroup(group: ExportColumnGroup, on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev)
      for (const c of group.columns) {
        if (required.has(c.key)) continue
        if (on) next.add(c.key)
        else next.delete(c.key)
      }
      return next
    })
  }

  const nothingChosen = chosen.length === 0

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 10000, background: 'var(--color-overlay)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div style={{ background: 'var(--color-surface)', borderRadius: 8, width: '90vw', maxWidth: 640, maxHeight: '85vh', display: 'flex', flexDirection: 'column', boxShadow: '0 25px 50px -12px rgba(0,0,0,.25)' }}>
        <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>{title}</h3>
          <button type="button" aria-label="Close" onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.25rem', color: 'var(--color-text-secondary)' }}>×</button>
        </div>

        <div style={{ padding: '0.75rem 1.25rem', borderBottom: '1px solid var(--color-border)', display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setSelected(new Set(allKeys))}>Tick everything</button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setSelected(new Set(required))}>Clear</button>
          <span style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)' }}>{chosen.length} of {allKeys.length} columns</span>
        </div>

        <div style={{ padding: '1.25rem', overflowY: 'auto', display: 'grid', gap: '1rem' }}>
          {description && <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>{description}</p>}

          {groups.map((group) => {
            const keys = group.columns.map((c) => c.key)
            const allOn = keys.every((k) => selected.has(k) || required.has(k))
            return (
              <fieldset key={group.label} style={{ border: '1px solid var(--color-border)', borderRadius: 6, padding: '0.75rem', margin: 0 }}>
                <legend style={{ fontSize: '0.8125rem', fontWeight: 600, padding: '0 0.25rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <span>{group.label}</span>
                  <button
                    type="button"
                    onClick={() => setGroup(group, !allOn)}
                    style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--color-primary)', fontSize: '0.75rem', fontWeight: 500 }}
                  >
                    {allOn ? 'none' : 'all'}
                  </button>
                </legend>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 13rem), 1fr))', gap: '0.25rem 0.75rem' }}>
                  {group.columns.map((c) => (
                    <label key={c.key} style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start', fontSize: '0.875rem', cursor: required.has(c.key) ? 'default' : 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={selected.has(c.key) || required.has(c.key)}
                        disabled={required.has(c.key)}
                        onChange={() => toggle(c.key)}
                        style={{ marginTop: '0.2rem' }}
                      />
                      <span>
                        {c.label}
                        {c.hint && <span style={{ display: 'block', color: 'var(--color-text-secondary)', fontSize: '0.75rem' }}>{c.hint}</span>}
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
            )
          })}
        </div>

        <div style={{ padding: '1rem 1.25rem', borderTop: '1px solid var(--color-border)', display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <a
            className="btn btn-primary"
            href={nothingChosen ? undefined : buildHref(chosen)}
            aria-disabled={nothingChosen}
            style={nothingChosen ? { pointerEvents: 'none', opacity: 0.5 } : undefined}
            onClick={() => { writeStored(storageKey, chosen); onClose() }}
          >
            Download CSV
          </a>
        </div>
      </div>
    </div>
  )
}
