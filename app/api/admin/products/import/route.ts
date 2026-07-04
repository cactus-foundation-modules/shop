import { NextRequest, NextResponse } from 'next/server'
import { after } from 'next/server'
import { requireShopUser } from '@/modules/shop/lib/access'
import { createImportJob, markImportJobStarted, listRecentImportJobs } from '@/modules/shop/lib/db/import-jobs'
import { processImportJob } from '@/modules/shop/lib/import-engine'
import { parseCsv } from '@/modules/shop/lib/csv'

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
  const columnMap = typeof columnMapRaw === 'string' ? (JSON.parse(columnMapRaw) as Record<string, string>) : null

  const csvText = await file.text()
  const rows = parseCsv(csvText)
  const totalRows = Math.max(rows.length - 1, 0)

  const { id: jobId } = await createImportJob({ filename: file.name, totalRows, createdBy: gate.user.id, columnMap })
  await markImportJobStarted(jobId)

  after(() => processImportJob(jobId, csvText, gate.user.email, columnMap))

  return NextResponse.json({ jobId }, { status: 202 })
}
