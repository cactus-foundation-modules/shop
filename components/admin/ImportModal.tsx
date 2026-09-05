'use client'

import { useState } from 'react'
import { parseCsv, headerMatchesFormat, headerMatchesUpdateFormat, CSV_COLUMNS } from '@/modules/shop/lib/csv'

type Step = 'upload' | 'mapping' | 'progress'
type Mode = 'FULL' | 'UPDATE_ONLY'

// The columns a sale-price sheet carries: the product's own code to match on,
// then the offer price and the code the supplier wants while it is on. Offered
// as a one-click template because it is far and away the commonest partial
// update an owner is handed by a supplier.
const SALE_TEMPLATE_COLUMNS = 'sku,sale_price,sale_sku'

// Two-step CSV import: upload, then (only if the headers don't already match the
// chosen mode's format) a mapping step to pair each uploaded column with a known
// field, before handing off to the existing POST /admin/products/import route.
//
// Update-only mode exists for the partial sheet: a supplier's sale-price list is
// three columns wide, has no name, type or price, and must never create anything.
export function ImportModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [step, setStep] = useState<Step>('upload')
  const [mode, setMode] = useState<Mode>('FULL')
  const [file, setFile] = useState<File | null>(null)
  const [header, setHeader] = useState<string[]>([])
  const [columnMap, setColumnMap] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [jobId, setJobId] = useState<string | null>(null)
  const [progress, setProgress] = useState<{ status: string; createdCount: number; updatedCount: number; skippedCount: number; totalRows: number } | null>(null)

  async function handleFile(f: File) {
    setError(null)
    setFile(f)
    const text = await f.text()
    const rows = parseCsv(text)
    const headerRow = rows[0] ?? []
    const matches = mode === 'UPDATE_ONLY' ? headerMatchesUpdateFormat(headerRow) : headerMatchesFormat(headerRow)
    if (matches) {
      await submit(f)
    } else {
      setHeader(headerRow)
      setStep('mapping')
    }
  }

  async function submit(f: File, map?: Record<string, string>) {
    const body = new FormData()
    body.append('file', f)
    body.append('mode', mode)
    if (map) body.append('columnMap', JSON.stringify(map))
    const res = await fetch('/api/m/shop/admin/products/import', { method: 'POST', body })
    if (!res.ok) { setError((await res.json()).error ?? 'Import failed to start'); return }
    const { jobId: id } = await res.json()
    setJobId(id)
    setStep('progress')
    poll(id)
  }

  function poll(id: string) {
    const interval = setInterval(async () => {
      const res = await fetch(`/api/m/shop/admin/products/import/${id}`)
      if (!res.ok) return
      const { job } = await res.json()
      setProgress(job)
      if (job.status === 'COMPLETED' || job.status === 'FAILED') {
        clearInterval(interval)
        onDone()
      }
    }, 1500)
  }

  // An update-only import matches on sku or slug, so the mapping step must not
  // let one start without one: every row would fail with nothing written.
  const hasMatchColumn = Object.values(columnMap).some((c) => c === 'sku' || c === 'slug')

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 10000, background: 'var(--color-overlay)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={(e) => e.target === e.currentTarget && step !== 'progress' && onClose()}
    >
      <div style={{ background: 'var(--color-surface)', borderRadius: 8, width: '90vw', maxWidth: 600, maxHeight: '85vh', display: 'flex', flexDirection: 'column', boxShadow: '0 25px 50px -12px rgba(0,0,0,.25)' }}>
        <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>Import products from CSV</h3>
          {step !== 'progress' && <button type="button" aria-label="Close" onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.25rem', color: 'var(--color-text-secondary)' }}>×</button>}
        </div>
        <div style={{ padding: '1.25rem', overflowY: 'auto' }}>
          {error && <p style={{ color: 'var(--color-danger)', fontSize: '0.875rem' }}>{error}</p>}

          {step === 'upload' && (
            <div style={{ display: 'grid', gap: '0.75rem' }}>
              <fieldset style={{ border: '1px solid var(--color-border)', borderRadius: 6, padding: '0.75rem', display: 'grid', gap: '0.5rem', margin: 0 }}>
                <legend style={{ fontSize: '0.8125rem', fontWeight: 600, padding: '0 0.25rem' }}>What is in this file?</legend>
                <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start', fontSize: '0.875rem' }}>
                  <input type="radio" name="import-mode" checked={mode === 'FULL'} onChange={() => setMode('FULL')} style={{ marginTop: '0.2rem' }} />
                  <span>
                    Whole products
                    <span style={{ display: 'block', color: 'var(--color-text-secondary)', fontSize: '0.8125rem' }}>Adds anything new and updates the rest. Needs the full set of columns.</span>
                  </span>
                </label>
                <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start', fontSize: '0.875rem' }}>
                  <input type="radio" name="import-mode" checked={mode === 'UPDATE_ONLY'} onChange={() => setMode('UPDATE_ONLY')} style={{ marginTop: '0.2rem' }} />
                  <span>
                    A few columns only, for products you already have
                    <span style={{ display: 'block', color: 'var(--color-text-secondary)', fontSize: '0.8125rem' }}>
                      Matches each row on its product code (sku) or web address (slug) and changes only the columns in the file. Nothing new is added. A sale price sheet goes here.
                    </span>
                  </span>
                </label>
              </fieldset>
              {mode === 'UPDATE_ONLY' && (
                <p style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)', margin: 0 }}>
                  Sale prices? <a href={`/api/m/shop/admin/products/import-template?columns=${SALE_TEMPLATE_COLUMNS}`}>Download the sale price template</a> - product code, sale price, sale code. Leave a sale price blank to take a product off sale.
                </p>
              )}
              <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', margin: 0 }}>
                {mode === 'FULL'
                  ? 'Choose a CSV file exported from Cactus, or your own using the same columns as the import template.'
                  : 'Choose a CSV file with a sku (or slug) column plus the columns you want to change.'}
              </p>
              <input type="file" accept=".csv,text/csv" onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleFile(f) }} />
            </div>
          )}

          {step === 'mapping' && (
            <div style={{ display: 'grid', gap: '0.75rem' }}>
              <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
                {mode === 'UPDATE_ONLY'
                  ? 'Match each of your columns to a field below. One of them must be sku or slug, so each row can be matched to a product you already have.'
                  : 'This file\u2019s column headers don\u2019t match the expected format. Match each of your columns to a field below, or leave as \u201cIgnore\u201d.'}
              </p>
              <div style={{ display: 'grid', gap: '0.5rem' }}>
                {header.map((h) => (
                  <label key={h} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <span style={{ flex: 1, fontSize: '0.875rem', fontWeight: 600 }}>{h}</span>
                    <select
                      value={columnMap[h] ?? ''}
                      onChange={(e) => setColumnMap((prev) => ({ ...prev, [h]: e.target.value }))}
                      style={{ flex: 1, padding: '0.375rem 0.5rem', borderRadius: 6, border: '1px solid var(--color-border)' }}
                    >
                      <option value="">Ignore this column</option>
                      {CSV_COLUMNS.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </label>
                ))}
              </div>
              {mode === 'UPDATE_ONLY' && !hasMatchColumn && (
                <p style={{ fontSize: '0.8125rem', color: 'var(--color-danger)', margin: 0 }}>Pick a sku or slug column first, or no row can be matched to a product.</p>
              )}
              <button type="button" className="btn btn-primary" disabled={!file || (mode === 'UPDATE_ONLY' && !hasMatchColumn)} onClick={() => file && submit(file, columnMap)} style={{ justifySelf: 'start' }}>
                Start import
              </button>
            </div>
          )}

          {step === 'progress' && (
            <div style={{ display: 'grid', gap: '0.5rem' }}>
              <p style={{ fontSize: '0.875rem' }}>Status: {progress?.status ?? 'PROCESSING'}</p>
              {progress && (
                <p style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)' }}>
                  {progress.createdCount} created, {progress.updatedCount} updated, {progress.skippedCount} skipped
                  {progress.totalRows ? ` of ${progress.totalRows} rows` : ''}
                </p>
              )}
              {(progress?.status === 'COMPLETED' || progress?.status === 'FAILED') && (
                <button type="button" className="btn btn-secondary" onClick={onClose} style={{ justifySelf: 'start' }}>Close</button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
