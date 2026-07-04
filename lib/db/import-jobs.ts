import { prisma } from '@/lib/db/prisma'
import { Prisma } from '@prisma/client'
import type { ShpImportJob } from '@/modules/shop/lib/types'

function mapJob(r: Record<string, unknown>): ShpImportJob {
  return {
    id: r.id as string,
    status: r.status as ShpImportJob['status'],
    filename: r.filename as string,
    totalRows: r.total_rows as number,
    processedRows: r.processed_rows as number,
    createdCount: r.created_count as number,
    updatedCount: r.updated_count as number,
    skippedCount: r.skipped_count as number,
    errors: (r.errors as ShpImportJob['errors']) ?? null,
    columnMap: (r.column_map as ShpImportJob['columnMap']) ?? null,
    createdBy: r.created_by as string,
    startedAt: (r.started_at as Date | null) ?? null,
    completedAt: (r.completed_at as Date | null) ?? null,
    createdAt: r.created_at as Date,
  }
}

export async function createImportJob(data: { filename: string; totalRows: number; createdBy: string; columnMap: Record<string, string> | null }): Promise<{ id: string }> {
  const rows = await prisma.$queryRaw<[{ id: string }]>`
    INSERT INTO "shp_import_jobs" ("filename", "total_rows", "created_by", "column_map", "status")
    VALUES (${data.filename}, ${data.totalRows}, ${data.createdBy}, ${data.columnMap ? JSON.stringify(data.columnMap) : null}::jsonb, 'PENDING')
    RETURNING "id"
  `
  return rows[0]
}

export async function getImportJobById(id: string): Promise<ShpImportJob | null> {
  const rows = await prisma.$queryRaw<Record<string, unknown>[]>`SELECT * FROM "shp_import_jobs" WHERE "id" = ${id} LIMIT 1`
  return rows[0] ? mapJob(rows[0]) : null
}

export async function listRecentImportJobs(limit = 5): Promise<ShpImportJob[]> {
  const rows = await prisma.$queryRaw<Record<string, unknown>[]>`
    SELECT * FROM "shp_import_jobs" ORDER BY "created_at" DESC LIMIT ${limit}
  `
  return rows.map(mapJob)
}

export async function markImportJobStarted(id: string): Promise<void> {
  await prisma.$executeRaw`UPDATE "shp_import_jobs" SET "status" = 'PROCESSING', "started_at" = CURRENT_TIMESTAMP WHERE "id" = ${id}`
}

export async function updateImportJobProgress(id: string, fields: {
  processedRows?: number; createdCount?: number; updatedCount?: number; skippedCount?: number
  errors?: Array<{ row: number; reason: string }>
}): Promise<void> {
  const sets: Prisma.Sql[] = []
  if (fields.processedRows !== undefined) sets.push(Prisma.sql`"processed_rows" = ${fields.processedRows}`)
  if (fields.createdCount !== undefined) sets.push(Prisma.sql`"created_count" = ${fields.createdCount}`)
  if (fields.updatedCount !== undefined) sets.push(Prisma.sql`"updated_count" = ${fields.updatedCount}`)
  if (fields.skippedCount !== undefined) sets.push(Prisma.sql`"skipped_count" = ${fields.skippedCount}`)
  if (fields.errors !== undefined) sets.push(Prisma.sql`"errors" = ${JSON.stringify(fields.errors)}::jsonb`)
  if (sets.length === 0) return
  await prisma.$executeRaw`UPDATE "shp_import_jobs" SET ${Prisma.join(sets, ', ')} WHERE "id" = ${id}`
}

export async function markImportJobCompleted(id: string, status: 'COMPLETED' | 'FAILED'): Promise<void> {
  await prisma.$executeRaw`UPDATE "shp_import_jobs" SET "status" = ${status}, "completed_at" = CURRENT_TIMESTAMP WHERE "id" = ${id}`
}

export async function pruneOldImportJobs(olderThanDays: number): Promise<number> {
  return prisma.$executeRaw`DELETE FROM "shp_import_jobs" WHERE "created_at" < NOW() - (${olderThanDays} || ' days')::interval`
}
