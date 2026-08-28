'use client'

import type { ShpPaymentLogo } from '@/modules/shop/lib/payments/provider'

// The height every brand mark is drawn at, whatever shape it is. Marks come in
// all proportions, so matching their heights is the only thing that makes a
// column of them look deliberate.
const LOGO_HEIGHT = 20

// A payment provider's brand mark, beside the method's name. Where the provider
// gives a dark-theme colourway, both images are rendered and core's logo-swap
// CSS hides the wrong one before paint - which is also why `display` is left out
// of the inline style here: setting it would beat that stylesheet rule and show
// both at once.
//
// Shared between the checkout's method list and the one on a customer's own
// order page, which is drawing the same methods and had better draw them the
// same way.
export function PaymentMethodLogo({ logo }: { logo: ShpPaymentLogo }) {
  const width = logo.height > 0 ? Math.round((logo.width / logo.height) * LOGO_HEIGHT) : LOGO_HEIGHT
  const style = { height: LOGO_HEIGHT, width: 'auto', flex: '0 0 auto' } as const
  const alt = logo.alt ?? ''
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element -- data: URI shipped by the payment module itself, nothing for the image optimiser to fetch */}
      <img src={logo.light} alt={alt} width={width} height={LOGO_HEIGHT} style={style} data-logo-variant={logo.dark ? 'light' : undefined} />
      {logo.dark && (
        // eslint-disable-next-line @next/next/no-img-element -- as above
        <img src={logo.dark} alt={alt} width={width} height={LOGO_HEIGHT} style={style} data-logo-variant="dark" />
      )}
    </>
  )
}
