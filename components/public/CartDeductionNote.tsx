'use client'

// The order-size deduction's own line in the basket, drawn by shop rather than
// through CartNotes.
//
// It used to ride in the `notes` array with everything a module contributes, and
// that was wrong in two ways at once. Those notes are dressed per surface by the
// author (see cart-note-options.ts): the slide-out draws them green with a tick,
// and the cart page hides them altogether, because both defaults were written
// when a note meant a delivery estimate. A tick in front of "add £113 more"
// claims something is already settled when it is the opposite - an instruction -
// and hiding it on the cart page hides the one sentence that exists to move the
// order value, on the page where a shopper decides whether to add anything.
//
// So it gets its own element, always shown when there is one, and styled to
// match the same sentence on the product page: an accent edge, the money set
// apart. A shopper meets the identical wording and the identical look on the
// product page and in the basket, which is the whole point of it.
//
// The TEXT is still never composed here. It arrives finished from
// lib/order-size-deduction.ts, exactly as the product page's does.

export const CART_DEDUCTION_NOTE_CSS = `
.scd{display:flex;flex-direction:column;gap:6px;margin:0}
.scd-row{display:block;margin:0;padding:9px 14px;background:var(--color-bg-subtle);border-left:3px solid var(--color-primary);border-radius:0 7px 7px 0;font-size:14.5px;line-height:1.45;color:var(--color-text)}
/* Neutral ground on purpose. --color-primary-subtle was the obvious fill and
   fails AA in dark mode (the accent lands at 4.25:1 on it); every role clears AA
   on --color-bg-subtle in both themes. Same reasoning as .spd-osd-box on the
   product page, and the two must keep agreeing. */
.scd-amount{font-weight:600;color:var(--color-primary)}
`

// Where the figures sit in the sentence, so they can be set apart without this
// component knowing how the sentence is worded. The composer hands over the
// finished line and the amounts inside it; a plain indexOf then finds them,
// rather than a pattern that would break the day a currency symbol moved.
function emphasise(text: string, amounts: readonly string[]): Array<string | { amount: string }> {
  const out: Array<string | { amount: string }> = []
  let rest = text
  for (const amount of amounts) {
    if (!amount) continue
    const at = rest.indexOf(amount)
    if (at === -1) continue
    if (at > 0) out.push(rest.slice(0, at))
    out.push({ amount })
    rest = rest.slice(at + amount.length)
  }
  if (rest) out.push(rest)
  return out
}

export type CartDeductionNote = { id: string; text: string; amounts?: string[] }

export function CartDeductionNotes({ notes }: { notes: readonly CartDeductionNote[] }) {
  if (notes.length === 0) return null
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: CART_DEDUCTION_NOTE_CSS }} />
      <div className="scd">
        {notes.map((note) => (
          <p className="scd-row" key={note.id}>
            {emphasise(note.text, note.amounts ?? []).map((part, i) =>
              typeof part === 'string'
                ? part
                : <strong className="scd-amount" key={i}>{part.amount}</strong>,
            )}
          </p>
        ))}
      </div>
    </>
  )
}
