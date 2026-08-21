import {
  COLLECTION_LINK_SAMPLES,
  shopCollectionLinksCss,
  type ShopCollectionLinksProps,
} from './ShopCollectionLinks.shared'

// EDITOR half only: placeholder + Puck field config. The server render lives
// in ShopCollectionLinks.rsc.tsx (wired by `rscImport` in the manifest) so
// next/server + db imports never land in the client editor bundle.
//
// The block prints a fresh random handful of collection links on every page
// load - footer SEO that never goes stale and never needs curating. Which
// collections show is the server's business; the editor canvas shows stand-in
// names through the real classes and stylesheet so the chrome matches the
// live page exactly.

type EditorProps = ShopCollectionLinksProps & { id?: string; puck?: { isEditing?: boolean } }

export function ShopCollectionLinks(props: EditorProps) {
  const count = typeof props.count === 'number' && props.count > 0 ? Math.min(props.count, 24) : 6
  const names = Array.from({ length: count }, (_, i) => `${COLLECTION_LINK_SAMPLES[i % COLLECTION_LINK_SAMPLES.length]}${i >= COLLECTION_LINK_SAMPLES.length ? ` ${Math.floor(i / COLLECTION_LINK_SAMPLES.length) + 1}` : ''}`)
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: shopCollectionLinksCss(props.id, props) }} />
      <nav
        className="shop-collection-links"
        data-scl-id={props.id}
        data-scl-layout={props.layout === 'inline' ? 'inline' : 'stacked'}
        aria-label="Collections"
        style={{ opacity: 0.6, pointerEvents: 'none' }}
      >
        {props.title ? <h3>{props.title}</h3> : null}
        <ul>
          {names.map((name) => (
            <li key={name}><a href="#">{name}</a></li>
          ))}
          {props.allLabel ? <li><a href="#">{props.allLabel}</a></li> : null}
        </ul>
      </nav>
    </>
  )
}

export const shopCollectionLinksPuckComponent = {
  label: 'Shop: Collection Links',
  fields: {
    title: { type: 'text' as const, label: 'Heading (blank for none)' },
    count: { type: 'number' as const, label: 'How many links' },
    layout: {
      type: 'select' as const,
      label: 'Arrange as',
      options: [
        { value: 'stacked', label: 'Stacked list' },
        { value: 'inline', label: 'One wrapping row' },
      ],
    },
    allLabel: { type: 'text' as const, label: '"View all" link wording (blank for none)' },
    textColor: { type: 'text' as const, label: 'Heading colour (blank inherits)' },
    linkColor: { type: 'text' as const, label: 'Link colour (blank inherits)' },
    linkHoverColor: { type: 'text' as const, label: 'Link hover colour' },
    bulletColor: { type: 'text' as const, label: 'Bullet colour (stacked only)' },
  },
  defaultProps: { title: 'Collections', count: 6, layout: 'stacked', allLabel: 'View all collections', textColor: '', linkColor: '', linkHoverColor: '', bulletColor: '' },
  render: ShopCollectionLinks,
}
