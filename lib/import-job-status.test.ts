import { describe, expect, it } from 'vitest'
import {
  IMPORT_JOB_MAX_STORED_ERRORS,
  IMPORT_JOB_STALE_MS,
  capStoredImportErrors,
  effectiveImportJobStatus,
} from '@/modules/shop/lib/import-job-status'

const NOW = Date.parse('2026-09-21T12:00:00Z')
const ago = (ms: number) => new Date(NOW - ms)

describe('effectiveImportJobStatus', () => {
  it('leaves a finished job alone however old it is', () => {
    expect(effectiveImportJobStatus({ status: 'COMPLETED', startedAt: ago(IMPORT_JOB_STALE_MS * 10), createdAt: ago(IMPORT_JOB_STALE_MS * 10) }, NOW)).toBe('COMPLETED')
    expect(effectiveImportJobStatus({ status: 'FAILED', startedAt: ago(IMPORT_JOB_STALE_MS * 10), createdAt: ago(IMPORT_JOB_STALE_MS * 10) }, NOW)).toBe('FAILED')
  })

  it('believes a job that is still running within the window', () => {
    expect(effectiveImportJobStatus({ status: 'PROCESSING', startedAt: ago(30_000), createdAt: ago(31_000) }, NOW)).toBe('PROCESSING')
    expect(effectiveImportJobStatus({ status: 'PROCESSING', startedAt: ago(IMPORT_JOB_STALE_MS), createdAt: ago(IMPORT_JOB_STALE_MS) }, NOW)).toBe('PROCESSING')
  })

  it('reports a job left processing past the window as failed', () => {
    expect(effectiveImportJobStatus({ status: 'PROCESSING', startedAt: ago(IMPORT_JOB_STALE_MS + 1), createdAt: ago(IMPORT_JOB_STALE_MS + 1) }, NOW)).toBe('FAILED')
  })

  it('falls back to when the row was made for a job that never started', () => {
    expect(effectiveImportJobStatus({ status: 'PENDING', startedAt: null, createdAt: ago(IMPORT_JOB_STALE_MS + 1) }, NOW)).toBe('FAILED')
    expect(effectiveImportJobStatus({ status: 'PENDING', startedAt: null, createdAt: ago(1000) }, NOW)).toBe('PENDING')
  })
})

describe('capStoredImportErrors', () => {
  it('keeps a short list as it is', () => {
    const errors = [{ row: 2, reason: 'Missing name' }]
    expect(capStoredImportErrors(errors)).toBe(errors)
  })

  it('keeps only the first ones from a long list', () => {
    const errors = Array.from({ length: IMPORT_JOB_MAX_STORED_ERRORS + 50 }, (_, i) => ({ row: i + 2, reason: 'Missing name' }))
    const capped = capStoredImportErrors(errors)
    expect(capped).toHaveLength(IMPORT_JOB_MAX_STORED_ERRORS)
    expect(capped[0]).toEqual({ row: 2, reason: 'Missing name' })
  })
})
