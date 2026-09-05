import { NextRequest, NextResponse } from 'next/server'
import { after } from 'next/server'
import { requireShopUser } from '@/modules/shop/lib/access'
import { createImportJob, markImportJobStarted, listRecentImportJobs } from '@/modules/shop/lib/db/import-jobs'
import { processImportJob, type ImportMode } from '@/modules/shop/lib/import-engine'
import { parseCsv } from '@/modules/shop/lib/csv'
import { z } from 'zod'

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

// Accepts a multipart CSV upload, creates a job row and returns its ID
// immediately; processing happens in the background via after() (Q7).
export async function POST(request: NextRequest) {
  const gate = await requireShopUser('shop.products')
  if (gate.error) return gate.error

  const formData = await request.formData()
  const file = formData.get('file')
  if (!(file instanceof File)) return NextResponse.json({ error: 'Missing file' }, { status: 400 })

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
  const rows = parseCsv(csvText)
  const totalRows = Math.max(rows.length - 1, 0)

  const { id: jobId } = await createImportJob({ filename: file.name, totalRows, createdBy: gate.user.id, columnMap })
  await markImportJobStarted(jobId)

  after(() => processImportJob(jobId, csvText, gate.user.email, columnMap, { mode }))

  return NextResponse.json({ jobId }, { status: 202 })
}
