// Shared half of Shop: Collection Links - stylesheet, sample names and the
// colour sanitiser, in a file with no server imports so the RSC render and the
// client editor placeholder stamp identical classes and CSS (same split as
// ShopCategoryPills.shared.ts).

export type ShopCollectionLinksProps = {
  title?: string
  count?: number
  layout?: string
  allLabel?: string
  textColor?: string
  linkColor?: string
  linkHoverColor?: string
  bulletColor?: string
}

// Stand-in names for the editor canvas, which cannot fetch. Cycled to fill
// whatever count the sidebar asks for.
export const COLLECTION_LINK_SAMPLES = [
  'A collection',
  'Another one',
  'A third',
  'One more',
  'Yet another',
  'The last sample',
]

// The colour fields accept free text (tokens, light-dark(), hex), so strip the
// characters that could break out of a CSS declaration - same guard as the
// core rich text block's colour fields.
function safeColour(value: string): string {
  return value.replace(/[;{}<>]/g, '')
}

// Base chrome once, then per-instance colour rules keyed on the block id so
// two footers (or a footer and a preview) can carry different palettes on one
// page. Tokens by default: inherits the footer's own text colour and keeps AA
// in both modes because the pairing is the page's own.
export function shopCollectionLinksCss(id: string | undefined, props: ShopCollectionLinksProps): string {
  // Heading and list metrics mirror globals.css's `.puck-richtext` rules to
  // the value, so a footer column built from this block lines up with one
  // built from a rich text block: same h3 face/size/margins (the 1.25em top
  // margin is what keeps the column tops level - every column carries it, so
  // every heading starts on the same line) and the same 1.75 line-height +
  // per-item margin rhythm down the list.
  //
  // The li margin is 1em, NOT the 1.25em it looks like it should be. Rich text
  // gives `li` 0.25em and the `<p>` the editor puts inside it `0 0 1em`, and
  // those two bottom margins COLLAPSE rather than add - the li has no padding
  // or border, so its used bottom margin is max(1em, 0.25em) = 1em. This block
  // has no inner `<p>`, so the li carries that 1em directly. Summing them gave
  // a list a quarter-em looser per row than the columns either side of it.
  const rules: string[] = [`
.shop-collection-links h3 {
  margin: 1.25em 0 0.5em;
  line-height: 1.3;
  font-weight: 700;
  font-size: 1.25rem;
  font-family: var(--h3-family, var(--font-heading));
}
.shop-collection-links ul {
  margin: 0 0 1em 1.5em;
  padding: 0;
  line-height: 1.75;
  list-style-type: "›  ";
}
.shop-collection-links li {
  margin-bottom: 1em;
}
.shop-collection-links a {
  color: inherit;
  text-decoration: none;
}
.shop-collection-links a:hover {
  text-decoration: underline;
}
.shop-collection-links[data-scl-layout="inline"] ul {
  list-style: none;
  margin-left: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem 1.25rem;
}
.shop-collection-links[data-scl-layout="inline"] li {
  margin-bottom: 0;
}
`]
  if (id) {
    const sel = `.shop-collection-links[data-scl-id="${id}"]`
    if (props.textColor) rules.push(`${sel},${sel} h3{color:${safeColour(props.textColor)};}`)
    if (props.linkColor) rules.push(`${sel} a{color:${safeColour(props.linkColor)};}`)
    if (props.linkHoverColor) rules.push(`${sel} a:hover{color:${safeColour(props.linkHoverColor)};}`)
    if (props.bulletColor) rules.push(`${sel} ul li::marker{color:${safeColour(props.bulletColor)};}`)
  }
  return rules.join('')
}
