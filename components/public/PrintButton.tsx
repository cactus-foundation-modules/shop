'use client'

/** Prints the page it sits on. Hidden from the printout itself by the receipt's
 * own print stylesheet, so a printed receipt never has a "Print" button on it. */
export default function PrintButton({ label = 'Print this' }: { label?: string }) {
  return (
    <button type="button" className="btn" onClick={() => window.print()}>
      {label}
    </button>
  )
}
