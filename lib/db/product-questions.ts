import { prisma } from '@/lib/db/prisma'
import { Prisma } from '@prisma/client'
import { FAQ_ANSWER_MAX, FAQ_QUESTION_MAX, normaliseFaqSet } from '@/modules/shop/lib/faq'
import { notifyProductSaved } from '@/modules/shop/lib/product-saved'
import type {
  ShpProductQuestion,
  ShpProductQuestionStatus,
  ShpProductQuestionWithProduct,
} from '@/modules/shop/lib/types'

// Everything that reads or writes shp_product_questions (migration 056).
//
// Raw SQL rather than Prisma's model API, like the rest of this module: the
// table is created by a module migration and has no entry in core's schema.
// prisma.

function mapQuestion(r: Record<string, unknown>): ShpProductQuestion {
  return {
    id: r.id as string,
    productId: r.product_id as string,
    memberId: (r.member_id as string | null) ?? null,
    askerName: (r.asker_name as string | null) ?? null,
    askerEmail: r.asker_email as string,
    question: r.question as string,
    status: r.status as ShpProductQuestionStatus,
    answer: (r.answer as string | null) ?? null,
    answeredAt: (r.answered_at as Date | null) ?? null,
    answeredById: (r.answered_by_id as string | null) ?? null,
    answeredByName: (r.answered_by_name as string | null) ?? null,
    publishedAt: (r.published_at as Date | null) ?? null,
    createdAt: r.created_at as Date,
    updatedAt: r.updated_at as Date,
  }
}

function mapWithProduct(r: Record<string, unknown>): ShpProductQuestionWithProduct {
  return {
    ...mapQuestion(r),
    productName: (r.product_name as string | null) ?? 'Deleted product',
    productSlug: (r.product_slug as string | null) ?? '',
  }
}

export async function createProductQuestion(input: {
  productId: string
  askerName: string | null
  askerEmail: string
  question: string
  memberId: string | null
  submittedIp: string | null
}): Promise<ShpProductQuestion> {
  const rows = await prisma.$queryRaw<Record<string, unknown>[]>`
    INSERT INTO "shp_product_questions"
      ("product_id", "member_id", "asker_name", "asker_email", "question", "submitted_ip")
    VALUES (
      ${input.productId}, ${input.memberId}, ${input.askerName},
      ${input.askerEmail}, ${input.question}, ${input.submittedIp}
    )
    RETURNING *
  `
  // The INSERT either returns its row or throws; a missing one would be a
  // driver-level impossibility, and returning null would push a check into
  // every caller for a case that cannot happen.
  return mapQuestion(rows[0]!)
}

export async function getProductQuestion(id: string): Promise<ShpProductQuestionWithProduct | null> {
  const rows = await prisma.$queryRaw<Record<string, unknown>[]>`
    SELECT q.*, p."name" AS product_name, p."slug" AS product_slug
    FROM "shp_product_questions" q
    LEFT JOIN "shp_products" p ON p."id" = q."product_id"
    WHERE q."id" = ${id}
  `
  const row = rows[0]
  return row ? mapWithProduct(row) : null
}

/**
 * The admin queue. Waiting questions lead however the list is sorted - they are
 * the only ones with anything to do about them - and within each group the
 * oldest is first, because a question nobody has answered gets worse with age.
 */
export async function listProductQuestions(filter: {
  status?: ShpProductQuestionStatus | 'ALL'
  productId?: string
  page?: number
  perPage?: number
}): Promise<{ questions: ShpProductQuestionWithProduct[]; total: number; pendingTotal: number }> {
  const page = Math.max(1, Math.floor(Number(filter.page)) || 1)
  const perPage = Math.min(100, Math.max(1, Math.floor(Number(filter.perPage)) || 25))
  const offset = (page - 1) * perPage

  const clauses: Prisma.Sql[] = []
  if (filter.status && filter.status !== 'ALL') clauses.push(Prisma.sql`q."status" = ${filter.status}`)
  if (filter.productId) clauses.push(Prisma.sql`q."product_id" = ${filter.productId}`)
  const where = clauses.length > 0 ? Prisma.sql`WHERE ${Prisma.join(clauses, ' AND ')}` : Prisma.empty

  const rows = await prisma.$queryRaw<Record<string, unknown>[]>`
    SELECT q.*, p."name" AS product_name, p."slug" AS product_slug
    FROM "shp_product_questions" q
    LEFT JOIN "shp_products" p ON p."id" = q."product_id"
    ${where}
    ORDER BY (q."status" = 'PENDING') DESC, q."created_at" ASC
    LIMIT ${perPage} OFFSET ${offset}
  `
  const countRows = await prisma.$queryRaw<{ count: bigint }[]>`
    SELECT COUNT(*)::bigint AS count FROM "shp_product_questions" q ${where}
  `
  // Counted without the status filter on purpose: the badge has to say how many
  // are waiting while you are looking at the answered ones.
  const pendingRows = await prisma.$queryRaw<{ count: bigint }[]>`
    SELECT COUNT(*)::bigint AS count FROM "shp_product_questions" WHERE "status" = 'PENDING'
  `
  return {
    questions: rows.map(mapWithProduct),
    total: Number(countRows[0]?.count ?? 0),
    pendingTotal: Number(pendingRows[0]?.count ?? 0),
  }
}

export async function countPendingProductQuestions(): Promise<number> {
  const rows = await prisma.$queryRaw<{ count: bigint }[]>`
    SELECT COUNT(*)::bigint AS count FROM "shp_product_questions" WHERE "status" = 'PENDING'
  `
  return Number(rows[0]?.count ?? 0)
}

/**
 * Record an answer that has ALREADY been emailed.
 *
 * Called after the send, never before - see the route. A row marked ANSWERED
 * whose email never left is the one failure mode with no way back: nobody at the
 * shop would ever know to send it again.
 */
export async function recordProductQuestionAnswer(input: {
  id: string
  answer: string
  answeredById: string | null
  answeredByName: string | null
  /** True when the answer also went into the product's FAQs. */
  published: boolean
}): Promise<void> {
  await prisma.$executeRaw`
    UPDATE "shp_product_questions"
    SET "answer" = ${input.answer},
        "status" = 'ANSWERED',
        "answered_at" = CURRENT_TIMESTAMP,
        "answered_by_id" = ${input.answeredById},
        "answered_by_name" = ${input.answeredByName},
        "published_at" = ${input.published ? new Date() : null},
        "updated_at" = CURRENT_TIMESTAMP
    WHERE "id" = ${input.id}
  `
}

export async function setProductQuestionStatus(id: string, status: ShpProductQuestionStatus): Promise<void> {
  await prisma.$executeRaw`
    UPDATE "shp_product_questions"
    SET "status" = ${status}, "updated_at" = CURRENT_TIMESTAMP
    WHERE "id" = ${id}
  `
}

export async function deleteProductQuestion(id: string): Promise<void> {
  await prisma.$executeRaw`DELETE FROM "shp_product_questions" WHERE "id" = ${id}`
}

/**
 * Add one answered question to the product's own FAQ set.
 *
 * Read-modify-write of a jsonb column, so it runs inside a transaction with the
 * row locked: two answers written at the same moment on one product would
 * otherwise each read the set without the other and the second would erase the
 * first. FOR UPDATE is cheap here - a product's FAQs are written by hand, in
 * ones.
 *
 * Returns false, and adds nothing, when:
 *   - there was nothing to add to (the product has gone);
 *   - the same question is already on the page - a shop that answers the same
 *     thing twice should not end up printing it twice (matched loosely on the
 *     question text, the way resolveProductFaqs decides two questions are the
 *     same);
 *   - or either half is longer than a FAQ set may hold. The ask-a-question form
 *     takes a longer question than a FAQ heading is allowed to be, on purpose -
 *     people explain themselves - and writing an over-long one in here would
 *     leave a product whose FAQs read back perfectly well and whose editor
 *     refuses to save it (FaqSetBodySchema). The answer has still gone to the
 *     person who asked; the queue shows it never reached the page.
 */
export async function appendProductFaq(
  productId: string,
  item: { question: string; answer: string },
): Promise<boolean> {
  const question = item.question.trim()
  const answer = item.answer.trim()
  if (!question || !answer) return false
  if (question.length > FAQ_QUESTION_MAX || answer.length > FAQ_ANSWER_MAX) return false

  const added = await prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<Array<{ faqs: unknown }>>`
      SELECT "faqs" FROM "shp_products" WHERE "id" = ${productId} FOR UPDATE
    `
    const row = rows[0]
    if (!row) return false

    const set = normaliseFaqSet(row.faqs)
    const key = (value: string) => value.toLowerCase().replace(/\s+/g, ' ').replace(/[?？]+$/, '').trim()
    if (set.items.some((existing) => key(existing.question) === key(question))) return false

    // Appended rather than prepended: the questions an owner wrote are the ones
    // they chose to lead with, and a page whose FAQ list reshuffles itself every
    // time somebody asks something is a page nobody can proof-read.
    const next = { items: [...set.items, { question, answer }], inherit: set.inherit }
    await tx.$executeRaw`
      UPDATE "shp_products"
      SET "faqs" = ${JSON.stringify(next)}::jsonb, "updated_at" = CURRENT_TIMESTAMP
      WHERE "id" = ${productId}
    `
    return true
  })

  // Same courtesy updateProduct pays: a module keeping its own rows in step with
  // a product (search cards, SEO) is told the FAQs moved. After the commit, not
  // inside it - a listener reading the product back mid-transaction would read
  // the old row. It swallows its own failures, so this can never cost us an
  // answer that has already been emailed.
  if (added) await notifyProductSaved(productId, ['faqs'])
  return added
}
