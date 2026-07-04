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

export async function listDownloadsForOrder(orderId: string): Promise<ShpDigitalDownload[]> {
  const rows = await prisma.$queryRaw<Record<string, unknown>[]>`SELECT * FROM "shp_digital_downloads" WHERE "order_id" = ${orderId}`
  return rows.map(mapDownload)
}
