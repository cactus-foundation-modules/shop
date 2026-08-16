import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getOrderByNumber, getOrderByNumberAndEmail } from '@/modules/shop/lib/db/orders'
import { shopClosedResponse } from '@/modules/shop/lib/access'
import { checkInMemoryRateLimit, getClientIpFromRequest } from '@/modules/shop/lib/rate-limit'
import { verifyOrderReceiptToken } from '@/modules/shop/lib/order-receipt-token'
import { isValidUkPhone, normaliseStoredPhone, UK_PHONE_MESSAGE } from '@/modules/shop/lib/phone'
import { setOrderNotifyChannels, smsCapableNumber } from '@/modules/shop/lib/order-notify'
import { isSmsAvailable } from '@/lib/sms/send'

// "How would you like updates about this order?" on the confirmation page.
//
// Same proof of ownership as the order status route it sits beside: the signed
// token on the shop's own confirmation link, or the order number and email
// together for somebody who looked the order up. Nothing here reveals anything
// about the order - a wrong pair gets the same 404 either way - but it can
// change where the order updates go, so it is behind the same lock and the same
// rate limit.

const Body = z.object({
  orderNumber: z.string().min(1),
  email: z.string().email().optional(),
  token: z.string().optional(),
  channels: z.object({
    email: z.boolean(),
    sms: z.boolean(),
  }),
  phone: z.string().optional(),
})

export async function POST(request: NextRequest) {
  const closed = await shopClosedResponse()
  if (closed) return closed

  const ip = getClientIpFromRequest(request)
  if (!checkInMemoryRateLimit(`order-notifications:${ip}`, 20, 15 * 60 * 1000)) {
    return NextResponse.json({ error: 'Too many attempts, please try again in a little while.' }, { status: 429 })
  }

  const parsed = Body.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
  const { orderNumber, email, token, channels, phone } = parsed.data

  const order = verifyOrderReceiptToken(orderNumber, token ?? null)
    ? await getOrderByNumber(orderNumber)
    : email
      ? await getOrderByNumberAndEmail(orderNumber, email)
      : null
  if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })

  // Nobody gets to switch every channel off. An order is something the shop has
  // to be able to tell them about, so the choice is how, not whether.
  if (!channels.email && !channels.sms) {
    return NextResponse.json(
      { error: 'Choose at least one way for us to reach you about this order.' },
      { status: 400 },
    )
  }

  const typed = (phone ?? '').trim()
  if (typed && !isValidUkPhone(typed)) {
    return NextResponse.json({ error: UK_PHONE_MESSAGE }, { status: 400 })
  }

  const storedPhone = typed ? normaliseStoredPhone(typed) : order.notifyPhone ?? order.customerPhone

  if (channels.sms) {
    if (!(await isSmsAvailable())) {
      return NextResponse.json({ error: 'Text updates are not available on this shop.' }, { status: 503 })
    }
    if (!smsCapableNumber(storedPhone)) {
      return NextResponse.json(
        { error: 'Add a UK mobile number for text updates - a landline cannot receive them.' },
        { status: 400 },
      )
    }
  }

  await setOrderNotifyChannels(order, {
    email: channels.email,
    sms: channels.sms,
    phone: storedPhone,
  })

  return NextResponse.json({ email: channels.email, sms: channels.sms, phone: storedPhone ?? '' })
}
