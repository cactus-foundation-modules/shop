import Link from 'next/link'
import { Icon, ICON_DOC, ICON_PRINT } from '@/modules/shop/components/public/OrderDetailChrome'

// The paperwork for an order: the printable receipt, every invoice it has ever
// had, the proforma while there is one, and any credit notes.
//
// These used to trail off the end of the "Placed 3 August 2026" line as middot
// separated links. On a plain order that was two links and looked fine. On an
// order whose company had been corrected after invoicing - two invoices, one of
// them cancelled, plus a credit note - it was a five line grey paragraph with
// the documents hidden in it, which is the one place a customer's accountant
// goes looking.
//
// A row per document, with what it is on the left and what clicking does on the
// right, so a list of four is still a list of four.

export type OrderDocument = {
  key: string
  name: string
  /** A quiet line under the name - "cancelled and replaced", say. */
  note?: string | null
  /** Where it lives. Absent on a document that has not been raised yet, which
   *  is a row that says when to expect it rather than one to click. */
  href?: string | null
  /** What the link does, for the right hand column. */
  action?: string
  /** Its own tab: printing and opening a PDF are both detours, and somebody who
   *  came to look at their order should still have it when they are done. */
  newTab?: boolean
  icon: 'doc' | 'print'
  /** Next's Link for an in-app route, a plain anchor for a signed document URL.
   *  Signed links are not routes to prefetch, and prefetching one would put the
   *  token in the browser's speculation cache for nothing. */
  internal?: boolean
}

const ICONS = { doc: ICON_DOC, print: ICON_PRINT }

export function OrderDocuments({ documents }: { documents: OrderDocument[] }) {
  return (
    <ul className="sod-docs">
      {documents.map((document) => (
        <li key={document.key} className={document.href ? 'sod-doc' : 'sod-doc sod-doc-soon'}>
          <Icon>{ICONS[document.icon]}</Icon>
          <span className="sod-doc-name">
            {document.href ? (
              document.internal ? (
                <Link
                  href={document.href}
                  prefetch={false}
                  target={document.newTab ? '_blank' : undefined}
                  rel={document.newTab ? 'noopener' : undefined}
                >
                  {document.name}
                </Link>
              ) : (
                <a
                  href={document.href}
                  target={document.newTab ? '_blank' : undefined}
                  rel={document.newTab ? 'noopener' : undefined}
                >
                  {document.name}
                </a>
              )
            ) : (
              document.name
            )}
          </span>
          {document.note && <span className="sod-doc-note">{document.note}</span>}
          {document.href && document.action && (
            <span className="sod-doc-get" aria-hidden="true">{document.action}</span>
          )}
        </li>
      ))}
    </ul>
  )
}
