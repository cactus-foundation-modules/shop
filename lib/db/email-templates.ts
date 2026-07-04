import { prisma } from '@/lib/db/prisma'
import type { ShpEmailTemplate, ShpEmailTemplateTrigger } from '@/modules/shop/lib/types'

function mapTemplate(r: Record<string, unknown>): ShpEmailTemplate {
  return {
    id: r.id as string,
    trigger: r.trigger as ShpEmailTemplateTrigger,
    subject: r.subject as string,
    bodyHtml: r.body_html as string,
    isActive: r.is_active as boolean,
    updatedAt: r.updated_at as Date,
  }
}

export async function listEmailTemplates(): Promise<ShpEmailTemplate[]> {
  const rows = await prisma.$queryRaw<Record<string, unknown>[]>`SELECT * FROM "shp_email_templates" ORDER BY "trigger" ASC`
  return rows.map(mapTemplate)
}

export async function getEmailTemplate(trigger: ShpEmailTemplateTrigger): Promise<ShpEmailTemplate | null> {
  const rows = await prisma.$queryRaw<Record<string, unknown>[]>`SELECT * FROM "shp_email_templates" WHERE "trigger" = ${trigger} LIMIT 1`
  return rows[0] ? mapTemplate(rows[0]) : null
}

export async function updateEmailTemplate(trigger: ShpEmailTemplateTrigger, fields: { subject?: string; bodyHtml?: string; isActive?: boolean }): Promise<void> {
  const sets: string[] = []
  const values: unknown[] = []
  if (fields.subject !== undefined) { sets.push(`"subject" = $${sets.length + 1}`); values.push(fields.subject) }
  if (fields.bodyHtml !== undefined) { sets.push(`"body_html" = $${sets.length + 1}`); values.push(fields.bodyHtml) }
  if (fields.isActive !== undefined) { sets.push(`"is_active" = $${sets.length + 1}`); values.push(fields.isActive) }
  if (sets.length === 0) return
  sets.push(`"updated_at" = CURRENT_TIMESTAMP`)
  await prisma.$executeRawUnsafe(
    `UPDATE "shp_email_templates" SET ${sets.join(', ')} WHERE "trigger" = $${values.length + 1}`,
    ...values,
    trigger
  )
}
