import { prisma } from '@/lib/db/prisma'
import type { PuckData, ShpPageLayout, ShpPageLayoutKey } from '@/modules/shop/lib/types'

export async function getPageLayout(key: ShpPageLayoutKey): Promise<ShpPageLayout | null> {
  const rows = await prisma.$queryRaw<Record<string, unknown>[]>`SELECT * FROM "shp_page_layouts" WHERE "key" = ${key} LIMIT 1`
  const r = rows[0]
  return r ? { id: r.id as string, key: r.key as ShpPageLayoutKey, builderData: r.builder_data as PuckData, updatedAt: r.updated_at as Date } : null
}

export async function savePageLayout(key: ShpPageLayoutKey, builderData: PuckData): Promise<void> {
  await prisma.$executeRaw`
    UPDATE "shp_page_layouts" SET "builder_data" = ${JSON.stringify(builderData)}::jsonb, "updated_at" = CURRENT_TIMESTAMP WHERE "key" = ${key}
  `
}
