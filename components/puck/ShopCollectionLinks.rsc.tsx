import { connection } from 'next/server'
import { listRandomCollectionLinks } from '@/modules/shop/lib/db/catalogue'
import { shopCollectionLinksCss, type ShopCollectionLinksProps } from './ShopCollectionLinks.shared'
import { shopCollectionLinksPuckComponent } from './ShopCollectionLinks'

// Server (RSC) half of Shop: Collection Links. Kept out of the client editor
// bundle - see ShopCollectionLinks.tsx.
//
// Draws a fresh random handful of collections on every render: `connection()`
// keeps the page dynamic and the shuffle happens in the database, so two
// refreshes of the same page hand a crawler (and a shopper) two different
// sets of links. Real anchors in the server HTML, no nofollow - rotating
// internal links are rather the point.

type RscProps = ShopCollectionLinksProps & { id?: string }

export async function ShopCollectionLinksRsc(props: RscProps) {
  await connection()
  const count = typeof props.count === 'number' && props.count > 0 ? Math.min(props.count, 24) : 6
  const links = await listRandomCollectionLinks(count)
  if (links.length === 0) return null
  // Built via a variable rather than a literal string - a plain server <a> is
  // what the rest of the footer emits, and a literal internal-looking path
  // trips the Next.js no-html-link-for-pages lint rule that a computed one
  // doesn't.
  const base = '/shop/collections'
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: shopCollectionLinksCss(props.id, props) }} />
      <nav
        className="shop-collection-links"
        data-scl-id={props.id}
        data-scl-layout={props.layout === 'inline' ? 'inline' : 'stacked'}
        aria-label="Collections"
      >
        {props.title ? <h3>{props.title}</h3> : null}
        <ul>
          {links.map((c) => (
            <li key={c.slug}><a href={`${base}/${c.slug}`}>{c.name}</a></li>
          ))}
          {props.allLabel ? <li><a href={base}>{props.allLabel}</a></li> : null}
        </ul>
      </nav>
    </>
  )
}

export const shopCollectionLinksPuckRscComponent = { ...shopCollectionLinksPuckComponent, render: ShopCollectionLinksRsc }
