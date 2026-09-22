import type { ShpImportStatus } from '@/modules/shop/lib/types'

// What an import job row is allowed to claim about itself, as against what was
// last written to it.
//
// A CSV import runs inside the request that accepted the upload (after(), see
// app/api/admin/products/import/route.ts), and module routes get sixty seconds.
// A run that is killed at that ceiling - or that throws somewhere nothing
// catches - never reaches the line that writes COMPLETED, and the row used to
// say PROCESSING for ever: the import dialog polled it until somebody closed the
// tab, and the products screen's "Recent imports" went on claiming it was still
// running a month later.
//
// Ten minutes is far past anything a live run can reach. The shop's own upload
// is over inside a minute whatever happens, and the Google-Sheet Pull (the other
// thing that drives these rows) writes COMPLETED at the end of its first chunk,
// seconds after it starts. So a row still PENDING or PROCESSING ten minutes on is
// one whose run has died, and it is reported as FAILED. Worked out when the row
// is read rather than written back: there is nothing to tidy, and a run that was
// merely slow and does finish still gets the last word, because its own
// COMPLETED lands on the row as normal.
export const IMPORT_JOB_STALE_MS = 10 * 60 * 1000

// How many row errors a job row keeps. Every progress tick used to write the
// WHOLE list back, so a sheet with thousands of bad lines rewrote a
// multi-megabyte column every 25 rows and handed it to every poll. The first
// couple of hundred say everything an owner can act on - the same mistake
// repeated down a column - and the skipped count still carries the full total.
// Comfortably above what one Google-Sheet Pull chunk can produce (two per row at
// most, forty rows a chunk), which reads its chunk's errors back off the row.
export const IMPORT_JOB_MAX_STORED_ERRORS = 200

export function effectiveImportJobStatus(
  job: { status: ShpImportStatus; startedAt: Date | null; createdAt: Date },
  now: number = Date.now(),
): ShpImportStatus {
  if (job.status !== 'PENDING' && job.status !== 'PROCESSING') return job.status
  const since = new Date(job.startedAt ?? job.createdAt).getTime()
  if (Number.isNaN(since)) return job.status
  return now - since > IMPORT_JOB_STALE_MS ? 'FAILED' : job.status
}

export function capStoredImportErrors<T>(errors: T[]): T[] {
  return errors.length > IMPORT_JOB_MAX_STORED_ERRORS ? errors.slice(0, IMPORT_JOB_MAX_STORED_ERRORS) : errors
}
