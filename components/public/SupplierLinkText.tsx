// A sentence with a supplier's name in it, the name linked to their page.
//
// The sentence is composed elsewhere and arrives finished (lib/order-size-
// deduction.ts), so this never rewords anything: it finds the name in the text
// and wraps the first occurrence. No link, or a name the text does not contain,
// and the text comes back exactly as given.
//
// Opens in a new tab. Every place this appears is somewhere a shopper is part
// way through buying - the product page's buy column, the basket, the checkout -
// and a click that takes the page they were on away from them is a click that
// loses a sale.
//
// No directive: it renders nothing interactive of its own, so client islands and
// server parts can both use it.
import type { ReactNode } from 'react'
import type { SupplierLink } from '@/modules/shop/lib/order-size-deduction'

export function SupplierLinkText({
  text, link, className,
}: { text: string; link?: SupplierLink | null; className: string }): ReactNode {
  const at = link ? text.indexOf(link.name) : -1
  if (!link || at === -1) return text
  return (
    <>
      {text.slice(0, at)}
      <a className={className} href={link.href} target="_blank" rel="noopener">{link.name}</a>
      {text.slice(at + link.name.length)}
    </>
  )
}
