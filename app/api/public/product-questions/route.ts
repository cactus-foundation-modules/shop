import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getMemberFromCookie } from '@/lib/members/session'
import { shopClosedResponse } from '@/modules/shop/lib/access'
import { getShopConfigCached } from '@/modules/shop/lib/config'
import { createProductQuestion } from '@/modules/shop/lib/db/product-questions'
import { getProductById } from '@/modules/shop/lib/db/products'
import { syncProductQuestionsNotification } from '@/modules/shop/lib/product-question-notify'
import { sendProductQuestionNotice } from '@/modules/shop/lib/product-question-emails'
import { checkInMemoryRateLimit } from '@/modules/shop/lib/rate-limit'
import { getClientIp } from '@/lib/auth/rate-limit'

// "Ask a question", from the product page (migration 056).
//
// This is a route strangers can post to, so it is gated four ways: the shop's
// own closed gate, the feature's own setting, a per-IP rate limit, and a
// honeypot field. None of them is a wall - they are the cheap ones that stop a
// drive-by script filling the queue.

const Body = z.object({
  productId: z.string(),
  email: z.string().email().max(200),
  name: z.string().max(120).optional(),
  // Capped rather than unbounded: a question is a question, and a 40KB one is
  // somebody testing what this route does.
  question: z.string().trim().min(5).max(2000),
  // The honeypot. A real form leaves it empty because it is hidden; the sort of
  // script that fills every input it finds does not.
  website: z.string().max(200).optional(),
})

export async function POST(request: NextRequest) {
  const closed = await shopClosedResponse()
  if (closed) return closed

  const config = await getShopConfigCached()
  // The button is not on the page when this is off, so reaching here means
  // somebody went looking. Answered with the same "not here" a missing route
  // would give rather than an explanation.
  if (!config.productQuestionsEnabled) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const ip = await getClientIp()
  if (!checkInMemoryRateLimit(`product-question:${ip}`, 5, 60 * 60 * 1000)) {
    return NextResponse.json({ error: 'Too many questions from here just now. Please try again later.' }, { status: 429 })
  }

  const parsed = Body.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })

  // A filled honeypot is answered with success and nothing is written. Telling a
  // bot it was caught only teaches whoever wrote it to stop filling the field.
  if (parsed.data.website) return NextResponse.json({ submitted: true })

  const product = await getProductById(parsed.data.productId)
  if (!product) return NextResponse.json({ error: 'Product not found' }, { status: 404 })

  const member = await getMemberFromCookie().catch(() => null)
  const name = parsed.data.name?.trim() || null

  const question = await createProductQuestion({
    productId: product.id,
    askerName: name,
    askerEmail: parsed.data.email.trim(),
    question: parsed.data.question,
    memberId: member?.id ?? null,
    submittedIp: ip,
  })

  syncProductQuestionsNotification().catch((err) =>
    console.error('[shop] product questions notification sync failed', err),
  )

  // The question is saved. Everything past this point is a courtesy to the shop,
  // and none of it is allowed to turn a saved question into an error the shopper
  // is asked to retry - which would land the same question in the queue twice.
  if (config.productQuestionsNotifyEmail) {
    await sendProductQuestionNotice({
      to: config.productQuestionsNotifyEmail,
      productName: product.name,
      productSlug: product.slug,
      askerName: name,
      askerEmail: question.askerEmail,
      question: question.question,
    }).catch((err) => console.error('[shop] product question notice failed', err))
  }

  return NextResponse.json({ submitted: true })
}
