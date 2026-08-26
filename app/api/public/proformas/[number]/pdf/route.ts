import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromCookie } from '@/lib/auth/session'
import { getMemberFromCookie } from '@/lib/members/session'
import { getShopConfigCached } from '@/modules/shop/lib/config'
import { checkInMemoryRateLimit, getClientIpFromRequest } from '@/modules/shop/lib/rate-limit'
import { verifyProformaToken } from '@/modules/shop/lib/invoice-token'
import { InvoicePdfUnavailableError, invoicePdfFilename } from '@/modules/shop/lib/invoice-pdf'
import { renderProformaPdf } from '@/modules/shop/lib/proforma-pdf'
import { loadProforma } from '@/modules/shop/lib/proforma'

// GET - the proforma as a PDF. What the button under the document points at, and
// what the "how to pay" email attaches.
//
// Everything here matches the invoice's own PDF route, including the throttle:
// printing runs a headless browser, and five a minute per address is plenty for
// somebody saving their own paperwork and useless to anybody trying to make the
// box sweat. Access is the same three ways - the signed link, the member whose
// order it is, or a staff session - and a refusal is a 404 either way, because
// order numbers run in sequence.

export async function GET(request: NextRequest, context: { params: Promise<{ number: string }> }) {
  const ip = getClientIpFromRequest(request)
  if (!checkInMemoryRateLimit(`shp-proforma-pdf:${ip}`, 5, 60_000)) {
    return NextResponse.json({ error: 'Too many downloads at once, please try again in a minute.' }, { status: 429 })
  }

  const { number: raw } = await context.params
  const orderNumber = decodeURIComponent(raw)
  const loaded = await loadProforma(orderNumber)
  if (!loaded) return NextResponse.json({ error: 'We could not find that proforma.' }, { status: 404 })
  const { order } = loaded

  let allowed = verifyProformaToken(order.orderNumber, request.nextUrl.searchParams.get('t'))
  if (!allowed) {
    const [member, user] = await Promise.all([getMemberFromCookie(), getSessionFromCookie()])
    if (member) allowed = Boolean(order.memberId && order.memberId === member.id)
    if (!allowed && user) allowed = true
  }
  if (!allowed) return NextResponse.json({ error: 'We could not find that proforma.' }, { status: 404 })

  const config = await getShopConfigCached()
  if (!config.invoicePdfEnabled) {
    return NextResponse.json({ error: 'PDF downloads are switched off on this shop.' }, { status: 403 })
  }

  try {
    const pdf = await renderProformaPdf(order.orderNumber)
    return new NextResponse(pdf as unknown as BodyInit, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${invoicePdfFilename(config.proformaPdfFilenamePrefix, order.orderNumber)}"`,
        // A proforma is drawn live from an order that can still change, so it is
        // the last thing that should be served from a cache - never mind that it
        // has somebody's address on it.
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    if (error instanceof InvoicePdfUnavailableError) {
      console.error('[shop] proforma PDF unavailable:', error.message)
      return NextResponse.json(
        { error: 'This proforma could not be turned into a PDF. The on-screen copy is still available.' },
        { status: 503 },
      )
    }
    console.error('[shop] proforma PDF failed', error)
    return NextResponse.json({ error: 'Something went wrong making that PDF.' }, { status: 500 })
  }
}
