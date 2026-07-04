export type ShopPromoBannerProps = {
  heading?: string
  body?: string
  ctaLabel?: string
  ctaHref?: string
  backgroundColour?: string
  imageId?: string
  imageUrl?: string
}

// No live data to fetch - editor and RSC render identically (parity invariant
// is trivial here). backgroundColour is a semantic token name, never a hex value.
export function ShopPromoBanner(props: ShopPromoBannerProps) {
  const bg = `var(--color-${props.backgroundColour || 'surface-muted'})`
  return (
    <section style={{ background: bg, borderRadius: 12, padding: '2rem', display: 'flex', alignItems: 'center', gap: '1.5rem', flexWrap: 'wrap' }}>
      {props.imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={props.imageUrl} alt="" style={{ width: 120, height: 120, objectFit: 'cover', borderRadius: 8 }} />
      )}
      <div style={{ flex: 1, minWidth: 200 }}>
        {props.heading && <h2 style={{ margin: '0 0 0.5rem', fontSize: '1.5rem' }}>{props.heading}</h2>}
        {props.body && <p style={{ margin: '0 0 1rem', color: 'var(--color-text-muted)' }}>{props.body}</p>}
        {props.ctaLabel && props.ctaHref && (
          <a href={props.ctaHref} style={{ display: 'inline-block', background: 'var(--color-primary)', color: 'var(--color-on-primary)', padding: '0.625rem 1.25rem', borderRadius: 8, textDecoration: 'none', fontWeight: 600 }}>
            {props.ctaLabel}
          </a>
        )}
      </div>
    </section>
  )
}

export const shopPromoBannerPuckComponent = {
  label: 'Shop: Promo Banner',
  fields: {
    heading: { type: 'text' as const, label: 'Heading' },
    body: { type: 'textarea' as const, label: 'Body' },
    ctaLabel: { type: 'text' as const, label: 'Button label' },
    ctaHref: { type: 'text' as const, label: 'Button link' },
    backgroundColour: {
      type: 'select' as const, label: 'Background',
      options: [
        { value: 'surface-muted', label: 'Muted surface' },
        { value: 'surface', label: 'Surface' },
        { value: 'primary-muted', label: 'Primary (muted)' },
      ],
    },
    imageUrl: { type: 'text' as const, label: 'Image URL (optional)' },
  },
  defaultProps: { heading: 'Sale', body: '', ctaLabel: 'Shop now', ctaHref: '/shop', backgroundColour: 'surface-muted' },
  render: ShopPromoBanner,
}

export const shopPromoBannerPuckRscComponent = shopPromoBannerPuckComponent
