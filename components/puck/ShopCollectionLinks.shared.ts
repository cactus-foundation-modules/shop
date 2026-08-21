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
  const rules: string[] = [`
.shop-collection-links h3 {
  margin: 0 0 0.75rem;
  font-size: 1.05rem;
}
.shop-collection-links ul {
  margin: 0;
  padding: 0 0 0 1.1rem;
  list-style-type: "›  ";
  display: grid;
  gap: 0.4rem;
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
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem 1.25rem;
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
