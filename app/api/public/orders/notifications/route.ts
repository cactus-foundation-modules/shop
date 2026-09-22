import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getOrderByNumber } from '@/modules/shop/lib/db/orders'
import { checkInMemoryRateLimit } from '@/modules/shop/lib/rate-limit'
import { getClientIp } from '@/lib/auth/rate-limit'
import { mayOpenReceipt } from '@/modules/shop/lib/order-viewer'
import { isValidUkPhone, normaliseStoredPhone, UK_PHONE_MESSAGE } from '@/modules/shop/lib/phone'
import { setOrderNotifyChannels, smsCapableNumber } from '@/modules/shop/lib/order-notify'
import { isSmsAvailable } from '@/lib/sms/send'
import { getShopConfigCached } from '@/modules/shop/lib/config'

// "How would you like updates about this order?" on the confirmation page.
//
// Same proof as the order status route it sits beside, asked through the same
// one rule (lib/order-viewer.ts): this browser bought the thing, or is signed in
// as the owner, or has answered the delivery-postcode challenge. Nothing in the
// address opens it, and nothing here reveals anything about the order - every
// refusal is the same 404 - but it can change where the order updates GO, so a
// forwarded confirmation link must never reach it. Without that, a stranger
// holding one could have redirected somebody else's delivery texts to their own
// phone.

const Body = z.object({
  orderNumber: z.string().min(1),
  channels: z.object({
    email: z.boolean(),
    sms: z.boolean(),
  }),
  phone: z.string().optional(),
})

//
// Deliberately NOT behind the shop gate, like the order status route beside it:
// how a customer hears about an order already placed is post-purchase, and
// stays theirs to change while the shop is closed (see getShopGate in
// lib/access.ts).
export async function POST(request: NextRequest) {
  const ip = await getClientIp()
  if (!checkInMemoryRateLimit(`order-notifications:${ip}`, 20, 15 * 60 * 1000)) {
    return NextResponse.json({ error: 'Too many attempts, please try again in a little while.' }, { status: 429 })
  }

  const parsed = Body.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
  const { orderNumber, channels, phone } = parsed.data

  const order = await getOrderByNumber(orderNumber)
  // One wording for both, deliberately: an order number is a prefix and a
  // sequence, so "not yours" and "no such order" must be indistinguishable.
  if (!order || !(await mayOpenReceipt(request, order))) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 })
  }

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
    const [smsProviderReady, config] = await Promise.all([isSmsAvailable(), getShopConfigCached()])
    if (!smsProviderReady || !config.smsUpdatesEnabled) {
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
