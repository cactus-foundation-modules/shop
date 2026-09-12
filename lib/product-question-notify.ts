// One rolling "N product questions waiting" notification in the core admin bell.
// contact-form's syncMessagesNotification pattern exactly (modules/contact-form/
// lib/notify.ts): raised and kept in step while anything sits in the queue
// unanswered, cleared the moment the queue empties. Fire-and-forget from every
// route that changes what is waiting.
//
// The count is of PENDING rows, not of rows full stop, so the notice says the
// thing the shop actually has to act on - and it survives the feature being
// switched off, because questions already asked do not stop needing an answer
// because the button came down.
import { upsertAlert, clearAlert } from '@/lib/notifications/alerts'
import { countPendingProductQuestions } from './db/product-questions'

const DEDUPE_KEY = 'shop:product-questions'

export async function syncProductQuestionsNotification(): Promise<void> {
  const n = await countPendingProductQuestions()

  if (n > 0) {
    await upsertAlert({
      type: 'message',
      dedupeKey: DEDUPE_KEY,
      title: `${n} product question${n === 1 ? '' : 's'} waiting`,
      // The queue opens on its Waiting tab by default, which is where this is
      // sending them.
      link: '/m/shop/questions',
      // Without this the bell falls back to the 'message' type's "View Messages",
      // which is the contact-form inbox's label, not this one's.
      actionLabel: 'View questions',
    })
  } else {
    await clearAlert(DEDUPE_KEY)
  }
}
