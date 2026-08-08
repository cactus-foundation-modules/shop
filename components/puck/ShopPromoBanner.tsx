export type ShopPromoBannerProps = {
  heading?: string
  body?: string
  ctaLabel?: string
  ctaHref?: string
  backgroundColour?: string
  imageId?: string
  imageUrl?: string
  imageSide?: string
  imageSize?: number
  buttonStyle?: string
  align?: string
  smallPrint?: string
}

// No live data to fetch - editor and RSC render identically (parity invariant
// is trivial here). backgroundColour is a semantic token name, never a hex value.
// Every layout option guards on its non-default value, so a banner saved before
// the options existed renders byte-identical markup.
export function ShopPromoBanner(props: ShopPromoBannerProps) {
  const bg = `var(--color-${props.backgroundColour || 'bg-subtle'})`
  const imageRight = props.imageSide === 'right'
  const centred = props.align === 'centre'
  const outline = props.buttonStyle === 'outline'
  const imageSize = props.imageSize || 120
  const buttonStyles: React.CSSProperties = outline
    ? { display: 'inline-block', background: 'transparent', color: 'var(--color-primary)', border: '2px solid var(--color-primary)', padding: 'calc(0.625rem - 2px) calc(1.25rem - 2px)', borderRadius: 8, textDecoration: 'none', fontWeight: 600 }
    : { display: 'inline-block', background: 'var(--color-primary)', color: 'var(--color-on-primary)', padding: '0.625rem 1.25rem', borderRadius: 8, textDecoration: 'none', fontWeight: 600 }
  return (
    <section style={{ background: bg, borderRadius: 12, padding: '2rem', display: 'flex', alignItems: 'center', gap: '1.5rem', flexWrap: 'wrap', ...(imageRight ? { flexDirection: 'row-reverse' as const } : null) }}>
      {props.imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={props.imageUrl} alt="" style={{ width: imageSize, height: imageSize, objectFit: 'cover', borderRadius: 8 }} />
      )}
      <div style={{ flex: 1, minWidth: 200, ...(centred ? { textAlign: 'center' as const } : null) }}>
        {props.heading && <h2 style={{ margin: '0 0 0.5rem', fontSize: '1.5rem' }}>{props.heading}</h2>}
        {props.body && <p style={{ margin: '0 0 1rem', color: 'var(--color-text-muted)' }}>{props.body}</p>}
        {props.ctaLabel && props.ctaHref && (
          <a href={props.ctaHref} style={buttonStyles}>
            {props.ctaLabel}
          </a>
        )}
        {props.smallPrint && (
          <p style={{ margin: '0.75rem 0 0', fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>{props.smallPrint}</p>
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
        { value: 'bg-subtle', label: 'Muted surface' },
        { value: 'surface', label: 'Surface' },
        { value: 'primary-subtle', label: 'Primary (muted)' },
      ],
    },
    imageUrl: { type: 'text' as const, label: 'Image URL (optional)' },
    imageSide: { type: 'select' as const, label: 'Image sits on the', options: [{ value: 'left', label: 'Left' }, { value: 'right', label: 'Right' }] },
    imageSize: { type: 'number' as const, label: 'Image size (px)' },
    buttonStyle: { type: 'select' as const, label: 'Button style', options: [{ value: 'filled', label: 'Filled' }, { value: 'outline', label: 'Outline' }] },
    align: { type: 'select' as const, label: 'Text alignment', options: [{ value: 'left', label: 'Left' }, { value: 'centre', label: 'Centred' }] },
    smallPrint: { type: 'text' as const, label: 'Small print under the button (terms, dates)' },
  },
  defaultProps: { heading: 'Sale', body: '', ctaLabel: 'Shop now', ctaHref: '/shop', backgroundColour: 'bg-subtle', imageSide: 'left', imageSize: 120, buttonStyle: 'filled', align: 'left', smallPrint: '' },
  render: ShopPromoBanner,
}

export const shopPromoBannerPuckRscComponent = shopPromoBannerPuckComponent
