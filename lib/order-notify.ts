import { prisma } from '@/lib/db/prisma'
import { isSmsAvailable, sendSmsTemplate } from '@/lib/sms/send'
import { getMemberChannelPreference } from '@/lib/members/notification-prefs'
import { sendShopEmail } from '@/modules/shop/lib/email'
import type { EmailAttachment } from '@/lib/email/index'
import { SHOP_ORDER_UPDATES_CATEGORY, SHOP_TRIGGER_TO_SMS_KEY } from '@/modules/shop/lib/sms-templates'
import { parseUkPhone } from '@/modules/shop/lib/phone'
import type { ShpEmailTemplateTrigger, ShpOrder } from '@/modules/shop/lib/types'

// One place that decides how a customer hears about their order, so every
// milestone - confirmation, status change, part-dispatch, a return decision -
// goes out the same way.
//
// Where the choice is kept depends on who placed the order:
//
//   guest    - on the order itself (notify_email / notify_sms / notify_phone),
//              set on the confirmation page. A guest has no account to hang a
//              preference on, and the order is the only thing they can be shown
//              again from a link in their email.
//   member   - on their account (core's MemberNotificationPreference, category
//              shop:order-updates), which is what the notifications page edits.
//              The confirmation page writes both, so the order's own columns
//              stay a true record of what was chosen at the time and the admin
//              is not looking at a stale one.
//
// Neither can end up with nothing: both writing paths refuse to switch the last
// channel off, and this resolver falls back to email if it ever finds itself
// looking at an order with both switched off anyway.

export type OrderNotifyChannels = { email: boolean; sms: boolean; phone: string | null }

/** Texts only go to a mobile. A landline in the delivery number is not a
 * failure worth reporting anywhere - it simply is not a texting number, and the
 * email carries on as normal. */
export function smsCapableNumber(raw: string | null | undefined): string | null {
  const national = parseUkPhone(raw)
  return national && national.startsWith('07') ? national : null
}

export async function getOrderNotifyChannels(order: ShpOrder): Promise<OrderNotifyChannels> {
  const phone = smsCapableNumber(order.notifyPhone ?? order.customerPhone)

  let email = order.notifyEmail
  let sms = order.notifySms

  if (order.memberId) {
    const pref = await getMemberChannelPreference(order.memberId, SHOP_ORDER_UPDATES_CATEGORY)
    email = pref.email
    sms = pref.sms
  }

  // A text with no number to send it to is not a channel, whatever the tick box
  // says - and if that leaves nothing at all, the email goes.
  if (sms && !phone) sms = false
  if (!email && !sms) email = true

  return { email, sms, phone }
}

/** Records the choice on the order, and on the member's account when there is
 * one. Callers have already validated that at least one channel is on. */
export async function setOrderNotifyChannels(
  order: Pick<ShpOrder, 'id' | 'memberId'>,
  channels: { email: boolean; sms: boolean; phone: string | null },
): Promise<void> {
  await prisma.$executeRaw`
    UPDATE "shp_orders"
    SET "notify_email" = ${channels.email},
        "notify_sms" = ${channels.sms},
        "notify_phone" = ${channels.phone},
        "updated_at" = CURRENT_TIMESTAMP
    WHERE "id" = ${order.id}
  `

  if (!order.memberId) return

  // The member's own notifications page reads these rows, so a choice made at
  // checkout shows up there rather than the two disagreeing.
  for (const [channel, enabled] of [['EMAIL', channels.email], ['SMS', channels.sms]] as const) {
    await prisma.memberNotificationPreference.upsert({
      where: {
        memberId_channel_category: {
          memberId: order.memberId,
          channel,
          category: SHOP_ORDER_UPDATES_CATEGORY,
        },
      },
      create: { memberId: order.memberId, channel, category: SHOP_ORDER_UPDATES_CATEGORY, enabled },
      update: { enabled },
    })
  }
}

/**
 * Sends one order milestone on whichever channels the customer asked for.
 *
 * The email is unchanged from what it always was, including the order email log
 * entry; the text is an extra, sent only when there is a message registered for
 * the trigger, a number to send it to, and a module providing an SMS provider.
 * Nothing here throws: a notification failure must never take down the status
 * change or the payment that raised it.
 */
export async function notifyOrderCustomer(
  trigger: ShpEmailTemplateTrigger,
  order: ShpOrder,
  vars: Record<string, string>,
  // Files to travel with the email. Email only, obviously - a text message has
  // nowhere to put a PDF. A customer who asked for texts and not emails gets
  // neither the email nor its attachment, which is what they asked for; the
  // document is still on their own order page either way.
  opts?: { attachments?: EmailAttachment[] },
): Promise<void> {
  const channels = await getOrderNotifyChannels(order)

  if (channels.email) {
    await sendShopEmail(trigger, order.customerEmail, vars, { orderId: order.id, attachments: opts?.attachments })
  }

  const smsKey = SHOP_TRIGGER_TO_SMS_KEY[trigger]
  if (!channels.sms || !smsKey || !channels.phone) return
  if (!(await isSmsAvailable())) return

  await sendSmsTemplate(channels.phone, smsKey, vars)
}
