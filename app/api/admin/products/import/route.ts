import { NextRequest, NextResponse } from 'next/server'
import { after } from 'next/server'
import type { SessionUser } from '@/lib/auth/session'
import { requireShopUser } from '@/modules/shop/lib/access'
import { createImportJob, markImportJobStarted, listRecentImportJobs, failImportJobIfUnfinished } from '@/modules/shop/lib/db/import-jobs'
import { processImportJob, type ImportMode } from '@/modules/shop/lib/import-engine'
import { parseCsv } from '@/modules/shop/lib/csv'
import { MAX_UPLOAD_BYTES, MAX_UPLOAD_MB, tooLargeReason } from '@/lib/media/limits'
import { getActiveMediaProvider, isMediaProviderConfigured } from '@/lib/config/env'
import { downloadMedia } from '@/lib/media/upload'
import { IMPORT_CSV_MAX_BYTES, IMPORT_CSV_MAX_MB, SPLIT_THE_SHEET } from '@/modules/shop/lib/direct-upload'
import { checkLandedUpload, discardShopUpload, issueShopUploadTicket } from '@/modules/shop/lib/direct-upload-server'
import { z } from 'zod'

// The import runs in after(), which shares this request's sixty seconds (the
// module dispatcher's maxDuration). Stopping the rows at 45s leaves room to
// write the job's ending, so a big file stops at a row the owner is told about
// rather than being cut off mid-write with the job still saying "processing".
const IMPORT_BUDGET_MS = 45_000

const ColumnMapSchema = z.record(z.string(), z.string())
// FULL adds and updates from a whole-product CSV; UPDATE_ONLY writes only the
// columns a partial sheet carries onto products it matches by sku or slug, and
// never creates. Absent means FULL, so every existing caller is unchanged.
const ModeSchema = z.enum(['FULL', 'UPDATE_ONLY'])

// Recent imports log for the products list header (spec addendum C.7).
export async function GET() {
  const gate = await requireShopUser('shop.products')
  if (gate.error) return gate.error
  const jobs = await listRecentImportJobs(5)
  return NextResponse.json({ jobs })
}

// A sheet too big for the form goes straight to storage first (see
// lib/direct-upload.ts), in two calls: one to be told where to put it, then one
// naming what was put there, which starts the import exactly as a form upload
// does. Only the key and token come back - never the sheet's size or a url.
const Filename = z.string().trim().min(1).max(255)
const DirectBody = z.discriminatedUnion('action', [
  z.object({ action: z.literal('prepare'), filename: Filename, sizeBytes: z.number().int().positive() }),
  z.object({
    action: z.literal('import'),
    filename: Filename,
    key: z.string().min(1).max(1024),
    token: z.string().min(1).max(512),
    mode: ModeSchema.optional(),
    columnMap: ColumnMapSchema.nullable().optional(),
  }),
])

// Accepts a multipart CSV upload, creates a job row and returns its ID
// immediately; processing happens in the background via after() (Q7).
export async function POST(request: NextRequest) {
  const startedAt = Date.now()
  const gate = await requireShopUser('shop.products')
  if (gate.error) return gate.error

  // A JSON body is a sheet that is going, or has gone, straight to storage. A
  // form is the original upload, unchanged below.
  if (request.headers.get('content-type')?.startsWith('application/json')) {
    return handleDirectImport(request, gate.user, startedAt)
  }

  const formData = await request.formData()
  const file = formData.get('file')
  if (!(file instanceof File)) return NextResponse.json({ error: 'Missing file' }, { status: 400 })
  // Checked before the file is turned into text and parsed. The hosting
  // platform refuses a body much over this before the route even runs, so this
  // is the same ceiling said in words rather than a bare error page - and the
  // one the import dialog checks before it uploads.
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      { error: `${tooLargeReason(file.size)} Split the sheet into smaller files and import them one after another.` },
      { status: 413 },
    )
  }

  const columnMapRaw = formData.get('columnMap')
  let columnMap: Record<string, string> | null = null
  if (typeof columnMapRaw === 'string' && columnMapRaw.length > 0) {
    try {
      const parsed = ColumnMapSchema.safeParse(JSON.parse(columnMapRaw))
      if (!parsed.success) return NextResponse.json({ error: 'Invalid column mapping' }, { status: 400 })
      columnMap = parsed.data
    } catch {
      return NextResponse.json({ error: 'Invalid column mapping' }, { status: 400 })
    }
  }

  const modeRaw = formData.get('mode')
  let mode: ImportMode = 'FULL'
  if (typeof modeRaw === 'string' && modeRaw.length > 0) {
    const parsed = ModeSchema.safeParse(modeRaw)
    if (!parsed.success) return NextResponse.json({ error: 'Invalid import mode' }, { status: 400 })
    mode = parsed.data
  }

  const csvText = await file.text()
  return startImport({ filename: file.name, csvText, columnMap, mode, user: gate.user, startedAt })
}

// The job row and the background run, whichever way the sheet arrived.
async function startImport(input: {
  filename: string
  csvText: string
  columnMap: Record<string, string> | null
  mode: ImportMode
  user: SessionUser
  startedAt: number
}): Promise<Response> {
  const { filename, csvText, columnMap, mode, user, startedAt } = input
  const rows = parseCsv(csvText)
  const totalRows = Math.max(rows.length - 1, 0)

  const { id: jobId } = await createImportJob({ filename, totalRows, createdBy: user.id, columnMap })
  await markImportJobStarted(jobId)

  after(async () => {
    try {
      await processImportJob(jobId, csvText, user.email, columnMap, { mode, deadline: startedAt + IMPORT_BUDGET_MS })
    } catch (err) {
      // Nothing else would close the job: it would sit at PROCESSING and the
      // dialog would poll it until somebody gave up. Rows already written stay
      // written; re-importing the file carries on (see processImportJob).
      console.error(`[shop] product import ${jobId} failed`, err)
      await failImportJobIfUnfinished(jobId).catch((markErr) => console.error(`[shop] could not mark import ${jobId} failed`, markErr))
    }
  })

  return NextResponse.json({ jobId }, { status: 202 })
}

async function handleDirectImport(request: NextRequest, user: SessionUser, startedAt: number): Promise<Response> {
  const parsed = DirectBody.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'That import request was not recognised.' }, { status: 400 })
  const body = parsed.data

  const provider = await getActiveMediaProvider()
  if (!provider || !isMediaProviderConfigured(provider)) {
    return NextResponse.json(
      { error: `This site has no file storage set up, so a sheet over ${MAX_UPLOAD_MB} MB cannot be imported. ${SPLIT_THE_SHEET}` },
      { status: 503 },
    )
  }

  if (body.action === 'prepare') {
    // Refused before a byte moves, in the same words the dialog uses.
    if (body.sizeBytes > IMPORT_CSV_MAX_BYTES) {
      return NextResponse.json({ error: `${tooLargeReason(body.sizeBytes, IMPORT_CSV_MAX_MB)} ${SPLIT_THE_SHEET}` }, { status: 413 })
    }
    return NextResponse.json(issueShopUploadTicket(provider, 'imports', body.filename))
  }

  const landed = await checkLandedUpload({
    provider,
    purpose: 'imports',
    filename: body.filename,
    key: body.key,
    token: body.token,
    maxBytes: IMPORT_CSV_MAX_BYTES,
    tooLargeAdvice: SPLIT_THE_SHEET,
  })
  if (!landed.ok) return NextResponse.json({ error: landed.error }, { status: landed.status })

  // Read the sheet back into memory, then let the copy in storage go: it has done
  // its job, and the import works from the text from here on. Decoded the way the
  // form path's file.text() decodes - UTF-8, with a leading byte-order mark
  // dropped - so a spreadsheet's BOM cannot become part of the first column's
  // name and make a matching sheet look like one that needs mapping.
  let csvText: string
  try {
    const bytes = await downloadMedia(provider, landed.key, landed.url)
    csvText = new TextDecoder('utf-8').decode(bytes)
  } catch (err) {
    console.error(`[shop] could not read back the uploaded sheet ${landed.key}`, err)
    return NextResponse.json({ error: `"${body.filename}" reached storage but could not be read back. Try importing it again.` }, { status: 502 })
  } finally {
    await discardShopUpload(provider, landed.key)
  }

  return startImport({
    filename: body.filename,
    csvText,
    columnMap: body.columnMap ?? null,
    mode: body.mode ?? 'FULL',
    user,
    startedAt,
  })
}
