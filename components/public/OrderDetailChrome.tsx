// The shapes a member's order page is built out of: an icon, a card and a
// callout. Server components with no state of their own - they exist so the
// page reads as a list of what is on it rather than a wall of div soup, and so
// that a card is a card everywhere on it.
//
// Styling comes from order-detail-css.ts (the `sod-*` classes), injected once
// by the page.

const ICON_SIZE_PROPS = {
  viewBox: '0 0 24 24',
  xmlns: 'http://www.w3.org/2000/svg',
  'aria-hidden': true,
} as const

/** A 24x24 line icon. Stroke, fill and size come from whichever `sod-*` class
 *  is on the element around it, so one icon works at 13px in a step dot and at
 *  20px in a callout. */
export function Icon({ children }: { children: React.ReactNode }) {
  return <svg {...ICON_SIZE_PROPS} stroke="currentColor">{children}</svg>
}

export const ICON_TICK = <path d="m4 12 5.5 5.5L20 7" />
export const ICON_CLOCK = <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>
export const ICON_ALERT = <><circle cx="12" cy="12" r="9" /><path d="M12 8v5M12 16h.01" /></>
export const ICON_IMAGE = <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="m4 16 5-5 4 4 3-3 4 4" /></>
export const ICON_DOC = <><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" /></>
export const ICON_PRINT = <><path d="M7 9V3h10v6" /><rect x="4" y="9" width="16" height="7" rx="2" /><path d="M7 14h10v7H7z" /></>
export const ICON_DOWNLOAD = <><path d="M12 4v11" /><path d="m7.5 11 4.5 4.5 4.5-4.5" /><path d="M5 20h14" /></>

type CardProps = {
  title: string
  /** A quiet second line in the card's head - a count, a date, a caveat. */
  note?: string
  children: React.ReactNode
  /** Lists supply their own row padding; everything else takes the body's. */
  flush?: boolean
  /** Take the full width of the two-column grid rather than one column of it. */
  wide?: boolean
  /** A tinted strip under the body, edge to edge - the totals, in practice. */
  foot?: React.ReactNode
}

/** A titled box. One border radius, one head tint and one body gutter for every
 *  section on the page, which is the whole reason the old page's eleven
 *  hand-rolled `.card` blocks were worth replacing. */
export function OrderCard({ title, note, children, flush, wide, foot }: CardProps) {
  return (
    <section className={wide ? 'sod-card sod-wide' : 'sod-card'}>
      <div className="sod-card-head">
        <h2 className="sod-card-title">{title}</h2>
        {note && <p className="sod-card-note">{note}</p>}
      </div>
      <div className={flush ? 'sod-card-list' : 'sod-card-body'}>{children}</div>
      {foot}
    </section>
  )
}

type NoteTone = 'info' | 'ok' | 'warn' | 'bad'

const NOTE_ICON: Record<NoteTone, React.ReactNode> = {
  info: ICON_CLOCK,
  ok: ICON_TICK,
  warn: ICON_ALERT,
  bad: ICON_ALERT,
}

/** A "here is what is going on" message. The tint is the whole point, so the
 *  tone is required rather than defaulted - a warning that quietly renders as
 *  information is worse than no message at all. */
export function OrderNote({ tone, children }: { tone: NoteTone; children: React.ReactNode }) {
  return (
    <div className={`sod-note sod-note-${tone}`}>
      <Icon>{NOTE_ICON[tone]}</Icon>
      <div className="sod-note-body">{children}</div>
    </div>
  )
}
