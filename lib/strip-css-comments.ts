// Takes the comments out of a stylesheet before it goes on the wire.
//
// Shop's stylesheets are written as template strings with their reasoning kept
// inline, as CSS comments, because that is where the next person editing a rule
// will look for why it is the way it is. That is the right place to keep them and
// the wrong thing to send to a shopper: the product card sheet was 13,299 bytes on
// deskwell.co.uk in September 2026, and 5,898 of them were comments.
//
// Nor is it sent once. The sheet reaches the page through SharedStyle, which puts
// it in the markup a single time - but every card surface also carries its own
// copy in the flight payload React hands the browser alongside that markup, and a
// Suspense-streamed grid cannot share another grid's copy. The homepage carried
// six. So the comments were about 35 KB of that page on their own.
//
// Only the comments go. Everything else is passed through byte for byte - no
// whitespace folding, no rule merging - because a stylesheet that is merely
// smaller is safe, and one that has been "minified" by a hand-rolled regex is a
// defect waiting for the first selector it misreads. Quoted strings are copied
// verbatim, so a `content:'/*'` would survive; none of shop's sheets carry one,
// but the rule costs nothing and the failure would be invisible.
//
// Dependency-free and client-safe on purpose: card-parts.tsx calls it, and that
// file is in the page builder's client bundle as well as the server render.

/**
 * The stylesheet with every CSS comment removed, and any line the removal left
 * blank dropped with it. Quoted strings are never touched. An unterminated
 * comment runs to the end of the sheet, which is what a browser does with one.
 */
export function stripCssComments(css: string): string {
  let out = ''
  // Everything before this index has either been copied to `out` or skipped.
  let copiedTo = 0
  // The next thing that is not plain stylesheet: a comment opening, or a quote.
  // Runs of plain text between them are copied in one slice rather than a
  // character at a time, because a product page asks for this on every part.
  const opener = /\/\*|["']/g
  let found: RegExpExecArray | null
  while ((found = opener.exec(css)) !== null) {
    const at = found.index
    if (found[0] === '/*') {
      out += css.slice(copiedTo, at)
      const close = css.indexOf('*/', at + 2)
      copiedTo = close === -1 ? css.length : close + 2
      opener.lastIndex = copiedTo
      continue
    }
    // A quoted string: step to its closing quote, over escaped characters so an
    // escaped quote does not end it early, and carry on searching after it. The
    // string itself stays in the run that is copied next.
    const quote = found[0]
    let end = at + 1
    while (end < css.length && css[end] !== quote) end += css[end] === '\\' ? 2 : 1
    opener.lastIndex = Math.min(end + 1, css.length)
  }
  out += css.slice(copiedTo)
  // A comment that had a line to itself leaves that line empty; a run of them
  // leaves several. Each empty line goes, the newline that ends the rule before
  // it stays.
  return out.replace(/\n[ \t]*(?=\n)/g, '')
}
