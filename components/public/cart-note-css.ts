// Styling for the whole-basket note (CartNotes). Injected as a <style> string
// inside the module, never a core globals.css edit - same discipline as
// cart-drawer-css.ts and cart-line-css.ts.
//
// Class prefix `scn-` (shop cart note). Every colour comes through a custom
// property the component sets from the block's fields, so a swatch that carries
// a dark-mode arm (`light-dark(l, d)`) is passed straight through and the
// browser picks the arm - there is no second set of dark rules to keep in step.
//
// The note is sized against ITS COLUMN, not the window: `.scn` is an inline-size
// container and every length below is a `cqw`-clamped value. The same note is
// dropped into a 580px checkout column, a full-width cart page and a 420px
// slide-out panel, and a window-width media query cannot tell those apart. The
// box and the bubble both fill their column; only the type, the padding and the
// image shrink as the column narrows.

export const CART_NOTE_CSS = `
.scn{container-type:inline-size;width:100%;
  --scn-bg:var(--color-success-subtle);--scn-fg:var(--color-text);--scn-bd:transparent;
  --scn-r:12px;--scn-fs:15px;--scn-img:96px;--scn-tail:12px;--scn-w:400}

/* ---- Plain: the bare line, optionally ticked ---- */
.scn-plain{list-style:none;margin:0;padding:0;display:grid;gap:0.25rem}
.scn-plain li{display:flex;align-items:baseline;gap:0.4375rem;color:var(--scn-fg);
  font-weight:var(--scn-w);font-size:clamp(0.8125rem,4cqw,var(--scn-fs))}

/* ---- Box: full column width, its own colours and corners ---- */
.scn-box{box-sizing:border-box;width:100%;display:grid;gap:0.3125rem;
  background:var(--scn-bg);color:var(--scn-fg);border:1px solid var(--scn-bd);
  border-radius:var(--scn-r);font-weight:var(--scn-w);
  font-size:clamp(0.8125rem,4cqw,var(--scn-fs));
  padding:clamp(0.5rem,2.5cqw,0.875rem) clamp(0.75rem,3.5cqw,1.125rem)}
.scn-box p{margin:0}

/* ---- Bubble: an image with the note speaking out of it ---- */
.scn-bub{display:flex;align-items:center;gap:var(--scn-tail);width:100%}
.scn-bub-r{flex-direction:row-reverse}
/* The image gives up its stated width once the column can no longer spare it,
   so the bubble never gets squeezed to a two-word ribbon on a phone. */
.scn-bub-img{flex:0 0 auto;width:min(var(--scn-img),30cqw);height:auto;display:block}
.scn-bub-body{position:relative;flex:1 1 auto;min-width:0;box-sizing:border-box;
  display:grid;gap:0.3125rem;background:var(--scn-bg);color:var(--scn-fg);
  border:1px solid var(--scn-bd);border-radius:var(--scn-r);font-weight:var(--scn-w);
  font-size:clamp(0.8125rem,4cqw,var(--scn-fs));
  padding:clamp(0.625rem,3cqw,1.125rem) clamp(0.875rem,4cqw,1.375rem)}
.scn-bub-body p{margin:0}
/* The tail paints from the bubble's own background property, so it follows
   whichever light/dark arm the swatch composed with nothing to keep in step. */
.scn-bub-body::before{content:'';position:absolute;top:50%;transform:translateY(-50%);
  border-style:solid;border-color:transparent}
.scn-bub-l .scn-bub-body::before{left:calc(-1 * var(--scn-tail));
  border-width:var(--scn-tail) var(--scn-tail) var(--scn-tail) 0;border-right-color:var(--scn-bg)}
.scn-bub-r .scn-bub-body::before{right:calc(-1 * var(--scn-tail));
  border-width:var(--scn-tail) 0 var(--scn-tail) var(--scn-tail);border-left-color:var(--scn-bg)}

/* Below roughly a phone column the two cannot sit side by side and stay
   readable - the bubble narrows to one word a line while the picture keeps its
   width. Stack them instead and swing the point up at the picture. Every rule
   here repeats the selector shape of the one it overrides: a two-class rule
   outranks a one-class rule wherever it sits, container query or not. */
@container (max-width: 300px){
  .scn-bub{flex-direction:column;align-items:stretch}
  .scn-bub-r{flex-direction:column}
  .scn-bub-img{width:min(var(--scn-img),45cqw)}
  .scn-bub-r .scn-bub-img{align-self:flex-end}
  .scn-bub-l .scn-bub-body::before,
  .scn-bub-r .scn-bub-body::before{top:calc(-1 * var(--scn-tail));left:auto;right:auto;transform:none;
    border-width:0 var(--scn-tail) var(--scn-tail);border-color:transparent transparent var(--scn-bg)}
  .scn-bub-l .scn-bub-body::before{left:calc(var(--scn-tail) * 1.5)}
  .scn-bub-r .scn-bub-body::before{right:calc(var(--scn-tail) * 1.5)}
}
`
