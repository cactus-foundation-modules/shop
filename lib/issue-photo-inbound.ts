import { prisma } from '@/lib/db/prisma'
import { findPhotoRequestsAwaitingFrom, getRequestById, requestPhotoMediaIds, type AwaitingPhotoRequest } from '@/modules/shop/lib/db/order-requests'
import { attachCustomerPhotos } from '@/modules/shop/lib/issue-photo-actions'

// Photographs a customer emails back, put on the issue report that asked for
// them.
//
// The "could you send us a photograph?" email offers two ways to answer: the
// upload link, or replying with them attached. Without this the second way
// landed in the unified inbox and somebody had to download each picture and add
// it to the report by hand. Now the inbox hands the reply over as it arrives and
// the pictures go straight on the report.
//
// Registered against `unified-inbox.message-received`, asking for image files to
// be stored as mail arrives. The event is restated here as plain values and
// nothing imports the inbox, so on a site without it this is never called and
// costs nothing.
//
// Matched carefully, because a photograph on the wrong report is worse than one
// left in the inbox:
//   - the sender must be the order's own customer address,
//   - the report must be open and the shop must have asked for photographs on
//     it, in the last 60 days, before this email was written,
//   - where that customer has more than one report waiting, the order number
//     has to appear in the subject or the text (the reply quotes ours, which
//     names it) - otherwise nothing is attached and the note on the email says
//     so.
//
// Idempotent on the message, as the inbox requires: a second offer finds the
// pictures already on the report and adds none.

/** The inbox's payload, restated. Structural: it may send more. */
export type InboundPhotoEvent = {
  messageId: string
  fromAddress: string
  subject: string
  bodyText: string
  sentAt: string
  attachments?: Array<{ attachmentId: string; filename: string; mimeType: string; mediaId: string | null }>
}

/** What the inbox accepts back. Restated for the same reason. */
export type InboundPhotoOutcome = {
  links?: Array<{ moduleName: string; recordType: string; recordId: string; label: string }>
  note?: string
}

/** The kinds the inbox is asked to store, and the only ones attached. The inbox
 *  judges each by its own bytes, not by what the sender's mail program called it. */
export const ISSUE_PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp']

/** Which waiting report an email answers. Exported for the tests. */
export function pickAwaitingRequest(
  waiting: readonly AwaitingPhotoRequest[],
  event: Pick<InboundPhotoEvent, 'subject' | 'bodyText' | 'sentAt'>,
): { found: AwaitingPhotoRequest } | { reason: string } | null {
  const sent = Date.parse(event.sentAt)
  // Asked BEFORE this email was written. A minute's grace for clocks that
  // disagree; an email from last week re-offered by the inbox's catch-up is not
  // an answer to a question asked this morning.
  const asked = waiting.filter((one) => Number.isNaN(sent) || one.photosRequestedAt.getTime() <= sent + 60_000)
  if (asked.length === 0) return null
  const text = `${event.subject}\n${event.bodyText}`.toUpperCase()
  const named = asked.filter((one) => text.includes(one.orderNumber.toUpperCase()))
  if (named.length >= 1) return { found: named[0]! }
  if (asked.length === 1) return { found: asked[0]! }
  return {
    reason: `Photographs from a customer with ${asked.length} reports waiting on them, and the email does not say which order - add them to the right report by hand.`,
  }
}

export async function handleIssuePhotoEmail(event: InboundPhotoEvent): Promise<InboundPhotoOutcome> {
  const images = (event.attachments ?? []).filter(
    (file) => ISSUE_PHOTO_TYPES.includes(file.mimeType.toLowerCase()),
  )
  if (images.length === 0) return {}

  const waiting = await findPhotoRequestsAwaitingFrom(event.fromAddress)
  if (waiting.length === 0) return {}

  const picked = pickAwaitingRequest(waiting, event)
  if (!picked) return {}
  if ('reason' in picked) return { note: picked.reason }

  const { found } = picked
  const link = { moduleName: 'shop', recordType: 'order', recordId: found.orderId, label: found.orderNumber }

  const stored = images.filter((file): file is typeof file & { mediaId: string } => Boolean(file.mediaId))
  if (stored.length === 0) {
    return {
      links: [link],
      note: `Photographs for the report on ${found.orderNumber} that could not be fetched - open them here and add them to the report by hand.`,
    }
  }

  const already = await requestPhotoMediaIds(found.requestId, stored.map((file) => file.mediaId))
  const fresh = stored.filter((file) => !already.has(file.mediaId))
  if (fresh.length === 0) {
    return { links: [link], note: `Photographs added to the report on ${found.orderNumber}` }
  }

  // The address is read off the library row the inbox filed, never taken from
  // the event - the same rule the website upload follows.
  const media = await prisma.media.findMany({
    where: { id: { in: fresh.map((file) => file.mediaId) }, mimeType: { startsWith: 'image/' } },
    select: { id: true, url: true },
  })
  if (media.length === 0) return { links: [link] }

  const request = await getRequestById(found.requestId)
  if (!request) return { links: [link] }

  const added = await attachCustomerPhotos(request, media.map((row) => ({ mediaId: row.id, url: row.url })), 'email')
  if (!added.ok) return { links: [link], note: `Photographs for ${found.orderNumber} not added: ${added.error}` }
  return {
    links: [link],
    note: `${added.added} photograph${added.added === 1 ? '' : 's'} added to the report on ${found.orderNumber}`,
  }
}

/** The registration: the handler, and the kinds of file it wants stored. */
export const shopIssuePhotoEmailHandler = {
  handle: (event: InboundPhotoEvent): Promise<InboundPhotoOutcome> => handleIssuePhotoEmail(event),
  attachmentTypes: ISSUE_PHOTO_TYPES,
}
