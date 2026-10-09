import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireShopUser } from '@/modules/shop/lib/access'
import { getOrderById } from '@/modules/shop/lib/db/orders'
import {
  clearDeliveryDelay,
  getShipmentsForOrder,
  recordDelayedParcelNewDate,
  recordDeliveryDelay,
} from '@/modules/shop/lib/db/shipments'
import { deliveryBookingForShipment, formatDeliveryDay, isDeliveryDate, isSlotTime, nowInTimezone, slotMinutes } from '@/modules/shop/lib/delivery-slot'
import { currentDelay } from '@/modules/shop/lib/delivery-delay'
import { sendDeliveryDelayEmail, sendDeliveryNewDateEmail } from '@/modules/shop/lib/delivery-delay-email'
import { getSiteTimezone } from '@/lib/config/timezone.server'

// PROTECTED - a delivery that is not going to happen when the customer was
// told, reported from the order screen. See lib/delivery-delay.ts for the
// kinds and migrations/070_delivery_delays.sql for what is kept.
//
//   POST   { kind: 'today' }       running late, still trying today
//          { kind: 'rebooking' }   delayed, new day to follow
//          { kind: 'new-date' }    delayed to deliveryDate (window optional)
//          { kind: 'rebooked' }    the new day a delayed parcel was promised
//   DELETE ?shipmentId=            take back a delay reported by mistake
//
// The customer is emailed (and texted, where they asked for texts) unless
// emailCustomer is false. The record stands whether or not the mail server
// takes the message: a delay is true whether anybody was told or not.

const DELAY_NOTE_MAX_LENGTH = 500

const Body = z.object({
  shipmentId: z.string().min(1),
  kind: z.enum(['today', 'rebooking', 'new-date', 'rebooked']),
  deliveryDate: z.string().trim().refine(isDeliveryDate, 'That is not a real date.').nullable().optional(),
  deliverySlotStart: z.string().trim().refine(isSlotTime, 'A delivery time looks like 10:00.').nullable().optional(),
  deliverySlotEnd: z.string().trim().refine(isSlotTime, 'A delivery time looks like 10:00.').nullable().optional(),
  note: z
    .string()
    .max(DELAY_NOTE_MAX_LENGTH, `Keep the note for the customer under ${DELAY_NOTE_MAX_LENGTH} characters.`)
    .nullable()
    .optional(),
  emailCustomer: z.boolean().optional(),
})

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireShopUser('shop.orders')
  if (gate.error) return gate.error

  const { id } = await params
  const order = await getOrderById(id)
  if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })

  const parsed = Body.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid delay' }, { status: 400 })
  }
  const { shipmentId, kind } = parsed.data

  const existing = (await getShipmentsForOrder(id)).find((s) => s.id === shipmentId)
  if (!existing) return NextResponse.json({ error: 'That parcel is no longer on this order.' }, { status: 404 })
  if (order.status === 'COMPLETED') {
    return NextResponse.json({ error: 'That order is complete, so there is no delivery left to delay.' }, { status: 400 })
  }
  if (existing.deliveredAt || existing.signedAt || existing.signedBy?.trim()) {
    return NextResponse.json({ error: 'That parcel has already been delivered.' }, { status: 400 })
  }

  const timezone = await getSiteTimezone()
  const today = nowInTimezone(new Date(), timezone).date
  const booked = deliveryBookingForShipment(existing, timezone).date
  const open = currentDelay(existing, booked, today)

  // A new day, where this kind takes one: both ends of a window or neither,
  // and after the day that was missed - a delay to an earlier day is not one.
  const newDate = parsed.data.deliveryDate ?? null
  const slotStart = parsed.data.deliverySlotStart || null
  const slotEnd = parsed.data.deliverySlotEnd || null
  if (kind === 'new-date' || kind === 'rebooked') {
    if (!newDate) return NextResponse.json({ error: 'Pick the new delivery date.' }, { status: 400 })
    if (Boolean(slotStart) !== Boolean(slotEnd)) {
      return NextResponse.json({ error: 'A delivery window needs both a start and an end time.' }, { status: 400 })
    }
    if (slotStart && slotEnd && slotMinutes(slotStart) >= slotMinutes(slotEnd)) {
      return NextResponse.json({ error: 'The delivery window has to end after it starts.' }, { status: 400 })
    }
    if (newDate < today) return NextResponse.json({ error: 'The new delivery date is in the past.' }, { status: 400 })
  }

  // Whether an email is actually going: a quiet parcel (068) tells nobody.
  const wantEmail = parsed.data.emailCustomer !== false && !existing.quietCustomerEmails
  let emailed = false

  if (kind === 'rebooked') {
    if (!open) return NextResponse.json({ error: 'That parcel has no delay waiting on a new date.' }, { status: 400 })
    const missed = existing.deliveryDelayedFrom ?? ''
    if (missed && newDate && newDate <= missed) {
      return NextResponse.json({ error: `The new date has to be after ${formatDeliveryDay(missed)}, the day that was missed.` }, { status: 400 })
    }
    const ok = await recordDelayedParcelNewDate(shipmentId, id, { newDate: newDate as string, slotStart, slotEnd, told: wantEmail })
    if (!ok) return NextResponse.json({ error: 'That parcel is no longer on this order.' }, { status: 404 })
    if (wantEmail) {
      try {
        emailed = await sendDeliveryNewDateEmail({ orderId: id, shipmentId })
      } catch (error) {
        console.error('[shop] delivery new-date email failed', error)
      }
    }
    return NextResponse.json({ ok: true, emailed })
  }

  // The day that is not happening. Running late is about today, whatever was
  // booked; otherwise it is the booked day, or today where none was.
  const missedDay = kind === 'today' ? today : booked || today
  if (kind === 'today' && booked && booked > today) {
    return NextResponse.json({ error: `That delivery is booked for ${formatDeliveryDay(booked)}, not today. Report it as delayed instead.` }, { status: 400 })
  }
  if (kind === 'new-date' && newDate && newDate <= missedDay) {
    return NextResponse.json({ error: `The new date has to be after ${formatDeliveryDay(missedDay)}, the day that was missed.` }, { status: 400 })
  }

  const ok = await recordDeliveryDelay(shipmentId, id, {
    kind,
    missedDay,
    note: parsed.data.note?.trim() || null,
    newDate,
    slotStart,
    slotEnd,
    told: wantEmail,
  })
  if (!ok) return NextResponse.json({ error: 'That parcel is no longer on this order.' }, { status: 404 })

  if (wantEmail) {
    try {
      emailed = await sendDeliveryDelayEmail({ orderId: id, shipmentId, kind })
    } catch (error) {
      console.error('[shop] delivery delay email failed', error)
    }
  }
  return NextResponse.json({ ok: true, emailed })
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireShopUser('shop.orders')
  if (gate.error) return gate.error

  const { id } = await params
  const shipmentId = request.nextUrl.searchParams.get('shipmentId')
  if (!shipmentId) return NextResponse.json({ error: 'No parcel was named.' }, { status: 400 })

  const ok = await clearDeliveryDelay(shipmentId, id)
  if (!ok) return NextResponse.json({ error: 'That parcel is no longer on this order.' }, { status: 404 })
  return NextResponse.json({ ok: true })
}
