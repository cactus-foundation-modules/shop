import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireShopUser } from '@/modules/shop/lib/access'
import {
  appendProductFaq,
  deleteProductQuestion,
  getProductQuestion,
  recordProductQuestionAnswer,
  setProductQuestionStatus,
} from '@/modules/shop/lib/db/product-questions'
import { FAQ_ANSWER_MAX } from '@/modules/shop/lib/faq'
import { sendProductQuestionAnswer } from '@/modules/shop/lib/product-question-emails'
import { syncProductQuestionsNotification } from '@/modules/shop/lib/product-question-notify'

// The same ceiling a written FAQ answer has, and for the reason: this one is
// going to become one.
const AnswerBody = z.object({ answer: z.string().trim().min(1).max(FAQ_ANSWER_MAX) })
const StatusBody = z.object({ status: z.enum(['PENDING', 'ANSWERED', 'REJECTED']) })

/**
 * Answer one question: email it to whoever asked, put it on the product page,
 * record what was sent.
 *
 * THE ORDER IS THE SAFETY STORY, and it is the one contact-form arrived at too
 * (lib/reply.ts): SEND FIRST, then write. A failed send leaves the question in
 * the queue looking exactly as untouched as it is, so somebody tries again. The
 * other way round leaves a question marked answered that the customer never
 * heard about - and nobody at the shop would ever find out.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireShopUser('shop.products', { allowAccess: true })
  if (gate.error) return gate.error

  const { id } = await params
  const parsed = AnswerBody.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Write an answer first.' }, { status: 400 })

  const question = await getProductQuestion(id)
  if (!question) return NextResponse.json({ error: 'That question is not here any more.' }, { status: 404 })
  // Answering an answered question would send the customer a second email about
  // something they have already been told. Re-open it first if that is genuinely
  // what is wanted.
  if (question.status === 'ANSWERED') {
    return NextResponse.json({ error: 'That question has already been answered.' }, { status: 409 })
  }

  const answer = parsed.data.answer
  try {
    await sendProductQuestionAnswer({
      to: question.askerEmail,
      askerName: question.askerName,
      productName: question.productName,
      productSlug: question.productSlug,
      question: question.question,
      answer,
    })
  } catch (err) {
    console.error('[shop] product question answer email failed', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'The answer could not be sent.' },
      { status: 502 },
    )
  }

  // The email has gone. Everything below is bookkeeping, and none of it is
  // allowed to report failure in a way that invites a second send.
  //
  // Onto the product page, so the next shopper does not have to ask. False here
  // means there was nothing to add it to (the product has gone) or the same
  // question is already on the page - neither is an error, and both are visible
  // in the answer's own row afterwards.
  let published = false
  try {
    published = await appendProductFaq(question.productId, { question: question.question, answer })
  } catch (err) {
    console.error('[shop] publishing an answered question to the product FAQs failed', err)
  }

  await recordProductQuestionAnswer({
    id,
    answer,
    answeredById: gate.user.id,
    answeredByName: gate.user.displayName ?? gate.user.username,
    published,
  })

  syncProductQuestionsNotification().catch((err) =>
    console.error('[shop] product questions notification sync failed', err),
  )

  return NextResponse.json({ answered: true, published })
}

// Bin it, re-open it, or mark it dealt with by hand. No email either way - this
// is the shop's own filing, not a message to anybody.
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireShopUser('shop.products', { allowAccess: true })
  if (gate.error) return gate.error

  const { id } = await params
  const parsed = StatusBody.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })

  const question = await getProductQuestion(id)
  if (!question) return NextResponse.json({ error: 'That question is not here any more.' }, { status: 404 })

  await setProductQuestionStatus(id, parsed.data.status)

  syncProductQuestionsNotification().catch((err) =>
    console.error('[shop] product questions notification sync failed', err),
  )

  return NextResponse.json({ status: parsed.data.status })
}

// Gone for good, address and all - which is the point: this is the button that
// answers a "delete what you hold about me" request for somebody who never
// ordered anything. The answer already written into the product's FAQs is not
// touched, because it is the shop's own words about its own product; remove it
// on the product's FAQs tab if it should go too.
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireShopUser('shop.products', { allowAccess: true })
  if (gate.error) return gate.error

  const { id } = await params
  await deleteProductQuestion(id)

  syncProductQuestionsNotification().catch((err) =>
    console.error('[shop] product questions notification sync failed', err),
  )

  return NextResponse.json({ deleted: true })
}
