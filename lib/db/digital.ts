import { prisma } from '@/lib/db/prisma'
import type { ShpDigitalDownload, ShpDigitalFile } from '@/modules/shop/lib/types'

export async function createDigitalFile(data: { filename: string; url: string; size: number; mimeType: string }): Promise<{ id: string }> {
  const rows = await prisma.$queryRaw<[{ id: string }]>`
    INSERT INTO "shp_digital_files" ("filename", "url", "size", "mime_type") VALUES (${data.filename}, ${data.url}, ${data.size}, ${data.mimeType})
    RETURNING "id"
  `
  return rows[0]
}

export async function getDigitalFileById(id: string): Promise<ShpDigitalFile | null> {
  const rows = await prisma.$queryRaw<Record<string, unknown>[]>`SELECT * FROM "shp_digital_files" WHERE "id" = ${id} LIMIT 1`
  const r = rows[0]
  return r ? { id: r.id as string, filename: r.filename as string, url: r.url as string, size: r.size as number, mimeType: r.mime_type as string, createdAt: r.created_at as Date } : null
}

function mapDownload(r: Record<string, unknown>): ShpDigitalDownload {
  return {
    id: r.id as string,
    orderId: r.order_id as string,
    orderItemId: r.order_item_id as string,
    fileId: r.file_id as string,
    token: r.token as string,
    downloadCount: r.download_count as number,
    expiresAt: (r.expires_at as Date | null) ?? null,
    createdAt: r.created_at as Date,
  }
}

export async function createDigitalDownload(data: { orderId: string; orderItemId: string; fileId: string; expiresAt: Date | null }): Promise<{ id: string; token: string }> {
  const rows = await prisma.$queryRaw<[{ id: string; token: string }]>`
    INSERT INTO "shp_digital_downloads" ("order_id", "order_item_id", "file_id", "expires_at")
    VALUES (${data.orderId}, ${data.orderItemId}, ${data.fileId}, ${data.expiresAt})
    RETURNING "id", "token"
  `
  return rows[0]
}

export async function getDownloadByToken(token: string): Promise<ShpDigitalDownload | null> {
  const rows = await prisma.$queryRaw<Record<string, unknown>[]>`SELECT * FROM "shp_digital_downloads" WHERE "token" = ${token} LIMIT 1`
  return rows[0] ? mapDownload(rows[0]) : null
}

export async function incrementDownloadCount(id: string): Promise<void> {
  await prisma.$executeRaw`UPDATE "shp_digital_downloads" SET "download_count" = "download_count" + 1 WHERE "id" = ${id}`
}

/**
 * Takes one of the link's downloads before a byte is sent, or reports that
 * there are none left. True when the slot was taken.
 *
 * The limit lives in the WHERE, so the check and the count are one statement.
 * Reading the count and adding to it afterwards let a shopper with one download
 * left open five tabs at once and get five: every request read "one left"
 * before any of them had finished and counted. Here the row lock makes the
 * second request wait for the first, and by then the first has taken the last.
 *
 * Two statements rather than one with an `IS NULL OR` in it: a parameter that
 * is sometimes a number and sometimes NULL has to be cast to be compared, and
 * the unlimited case has nothing to compare anyway.
 */
export async function reserveDownloadSlot(id: string, limit: number | null): Promise<boolean> {
  const taken = limit == null
    ? await prisma.$executeRaw`
        UPDATE "shp_digital_downloads" SET "download_count" = "download_count" + 1
        WHERE "id" = ${id}
      `
    : await prisma.$executeRaw`
        UPDATE "shp_digital_downloads" SET "download_count" = "download_count" + 1
        WHERE "id" = ${id} AND "download_count" < ${limit}
      `
  return taken > 0
}

/** Hands back a slot reserveDownloadSlot took, for a transfer that never
 *  finished - the file could not be fetched, or the customer's connection
 *  dropped partway. Clamped at zero so a stray second call cannot go negative. */
export async function releaseDownloadSlot(id: string): Promise<void> {
  await prisma.$executeRaw`
    UPDATE "shp_digital_downloads" SET "download_count" = GREATEST("download_count" - 1, 0)
    WHERE "id" = ${id}
  `
}

export async function listDownloadsForOrder(orderId: string): Promise<ShpDigitalDownload[]> {
  const rows = await prisma.$queryRaw<Record<string, unknown>[]>`SELECT * FROM "shp_digital_downloads" WHERE "order_id" = ${orderId}`
  return rows.map(mapDownload)
}
