import { Component } from 'react'
import { flushSync } from 'react-dom'

// Grows the product grid without moving the page.
//
// Browsers with scroll anchoring (Chrome, Edge, Firefox) pick an element on
// screen and keep it where it is when content above it changes size. A shopper
// who has scrolled to the end of a grid is looking at the pager or the footer,
// so that is what gets picked - and when the next page of cards lands above it,
// the browser scrolls down by the height of those cards to keep the footer in
// view. The shopper asked for more products and is shown the footer again. A
// click on "Show more" goes the same way by a different door: a focused element
// is the browser's first choice of anchor, so the page follows the button down
// and the new products end up above the fold.
//
// `overflow-anchor: none` would stop it, but only by switching anchoring off for
// the whole page, and anchoring is what stops an image loading late above where
// the shopper is reading from shoving the page about. This stops only the
// movement the new cards would cause.
//
// Two browsers, two moments, so two guards:
//
// Firefox applies the adjustment inside layout. Reading the scroll position back
// after the commit forces that layout, so the position read is the adjusted one
// and putting it back happens in the same task - nothing is painted in between.
//
// Chrome does not. Its adjustment is queued during layout and applied by the
// next animation frame (LocalFrameView::RunStyleAndLayoutLifecyclePhases, never
// UpdateStyleAndLayout), so at this point the page has not moved yet and there
// is nothing to read back: the first version of this helper relied on that read
// alone, shipped, and changed nothing. What Chrome does honour is an explicit
// scroll that actually moves - PaintLayerScrollableArea::UpdateScrollOffset
// clears the anchor for any user or programmatic scroll - and an adjustment
// whose anchor has been cleared is dropped when the frame comes round. So: one
// pixel up and straight back, in the same task. Nothing is painted between the
// two, and the next frame picks a fresh anchor from the finished layout.
//
// A browser without scroll anchoring never moved, and both guards are no-ops.
//
// Must not be called during render or from an effect: React is mid-commit
// there, cannot flush, and says so in the console.
// An event handler, an observer callback or a resolved promise are all fine,
// and those are the only places the grid grows from.
export function holdScrollPosition(update: () => void): void {
  const held = beginScrollHold()
  if (!held) {
    update()
    return
  }
  flushSync(update)
  endScrollHold(held)
}

// holdScrollPosition is for an update made of things already on the page - a
// window growing over cards in hand. It must NOT carry cards that have only just
// arrived from the server, and it did until 18 September 2026. A card fresh off
// the flight channel can suspend (it names a client chunk this visit has not
// loaded yet - a signed-in admin's cards did, a shopper's happened not to), and
// a SYNC update that suspends makes React swap the nearest Suspense boundary for
// its fallback there and then. Measured on the live site in Safari 27: the whole
// grid went display:none, the page lost 2,886px of height, the browser clamped
// the scroll to the new bottom - the footer - and when the cards came back 446ms
// later anchoring, doing its job properly for once, kept the footer where it was.
// The position had been put back faithfully, into a page too short to hold it.
//
// So a fetched batch goes in through startTransition, which keeps what is on
// screen until the new cards can actually render, and the hold moves to where
// that commit really happens, whenever that turns out to be:
//
//   <ScrollHoldSnapshot token={cards} into={heldRef} />   beside the grid
//   useLayoutEffect(() => releaseScrollHold(heldRef), [cards])   LAST layout effect
//
// getSnapshotBeforeUpdate is the one place React offers that runs before the
// commit touches the DOM, which is why this is a class. A child's lifecycle runs
// before its parent's layout effects, so the snapshot is always in the ref by
// the time the parent's last effect - after its own sort and paging passes have
// finished moving cards about - comes to release it.

export type HeldScroll = { top: number; left: number }

/** Where the page is now. Null where there is no window. */
export function beginScrollHold(): HeldScroll | null {
  if (typeof window === 'undefined') return null
  return { top: window.scrollY, left: window.scrollX }
}

/** Both guards described at the top of the file: the read-back restore, then the
 *  nudge. */
export function endScrollHold({ top, left }: HeldScroll): void {
  if (window.scrollY !== top || window.scrollX !== left) {
    window.scrollTo({ top, left, behavior: 'instant' })
  }
  // At the very top there is no anchoring to defeat - a scroller at offset zero
  // drops its anchor on its own - and no room to nudge upwards anyway.
  if (top > 0) {
    window.scrollTo({ top: top - 1, left, behavior: 'instant' })
    window.scrollTo({ top, left, behavior: 'instant' })
  }
}

type ScrollHoldSnapshotProps = { token: unknown; into: { current: HeldScroll | null } }

/** Renders nothing. Notes the scroll position in the instant before a commit
 *  that changes `token` reaches the DOM, and leaves it in `into` for
 *  releaseScrollHold. */
export class ScrollHoldSnapshot extends Component<ScrollHoldSnapshotProps> {
  override getSnapshotBeforeUpdate(prev: ScrollHoldSnapshotProps): HeldScroll | null {
    return prev.token === this.props.token ? null : beginScrollHold()
  }

  override componentDidUpdate(_prev: ScrollHoldSnapshotProps, _state: unknown, held: HeldScroll | null): void {
    if (held) this.props.into.current = held
  }

  override render(): null {
    return null
  }
}

/** The other half of ScrollHoldSnapshot. Safe to call when nothing is held. */
export function releaseScrollHold(into: { current: HeldScroll | null }): void {
  const held = into.current
  if (!held) return
  into.current = null
  endScrollHold(held)
}
