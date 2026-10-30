import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { resetKeyringState, setKeyringState } from '@/lib/crypto/keyring'
import {
  signCreditNoteToken,
  signInvoiceToken,
  signProformaToken,
  verifyCreditNoteToken,
  verifyInvoiceToken,
  verifyProformaToken,
} from '@/modules/shop/lib/invoice-token'
import { signOrderReceiptToken, verifyOrderReceiptToken } from '@/modules/shop/lib/order-receipt-token'
import { signOrderTrackingToken, verifyOrderTrackingToken } from '@/modules/shop/lib/order-tracking'
import { signUnsubscribeToken, verifyUnsubscribeToken } from '@/modules/shop/lib/unsubscribe-token'
import { signDocumentPrintToken, verifyDocumentPrintToken } from '@/modules/shop/lib/document-print-token'
import { mintSignedListCookie, readSignedListCookie } from '@/modules/shop/lib/signed-list-cookie'

// Every link and cookie the shop signs must survive the site moving to a new
// encryption key (core's lib/crypto/keyring.ts): one signed under the old key
// still verifies, and anything signed afterwards is signed under the new one.

const OLD = '1a'.repeat(32)
const NEW = '2b'.repeat(32)
const saved = process.env.ENCRYPTION_KEY

type Link = { name: string; sign: () => string; verify: (token: string) => boolean }

const links: Link[] = [
  { name: 'invoice', sign: () => signInvoiceToken('INV-1'), verify: (t) => verifyInvoiceToken('INV-1', t) },
  { name: 'credit note', sign: () => signCreditNoteToken('CN-1'), verify: (t) => verifyCreditNoteToken('CN-1', t) },
  { name: 'proforma', sign: () => signProformaToken('DW1'), verify: (t) => verifyProformaToken('DW1', t) },
  { name: 'receipt', sign: () => signOrderReceiptToken('DW1'), verify: (t) => verifyOrderReceiptToken('DW1', t) },
  { name: 'tracking', sign: () => signOrderTrackingToken('DW1'), verify: (t) => verifyOrderTrackingToken('DW1', t) },
  {
    name: 'back-in-stock unsubscribe',
    sign: () => signUnsubscribeToken('p1', 'a@b.co'),
    verify: (t) => verifyUnsubscribeToken(t) !== null,
  },
  {
    name: 'document print',
    sign: () => signDocumentPrintToken('invoice', 'INV-1'),
    verify: (t) => verifyDocumentPrintToken('invoice', 'INV-1', t),
  },
  {
    name: 'order access cookie',
    sign: () => mintSignedListCookie('orders', ['DW1'], 30, 10),
    verify: (t) => readSignedListCookie('orders', t, 10).length === 1,
  },
]

beforeEach(() => {
  resetKeyringState()
  process.env.ENCRYPTION_KEY = OLD
})

afterEach(() => {
  resetKeyringState()
  if (saved === undefined) delete process.env.ENCRYPTION_KEY
  else process.env.ENCRYPTION_KEY = saved
})

describe.each(links)('$name after a key rotation', (link) => {
  it('accepts one signed with the previous key', () => {
    const before = link.sign()
    process.env.ENCRYPTION_KEY = NEW
    setKeyringState({ previous: [OLD] })
    expect(link.verify(before)).toBe(true)
  })

  it('signs new ones with the current key only', () => {
    process.env.ENCRYPTION_KEY = NEW
    setKeyringState({ previous: [OLD] })
    const after = link.sign()
    expect(link.verify(after)).toBe(true)
    // With the new key gone, it no longer verifies: it was not the old key's.
    process.env.ENCRYPTION_KEY = OLD
    resetKeyringState()
    expect(link.verify(after)).toBe(false)
  })

  it('refuses one signed under a key the site never had', () => {
    process.env.ENCRYPTION_KEY = '3c'.repeat(32)
    const stranger = link.sign()
    process.env.ENCRYPTION_KEY = NEW
    setKeyringState({ previous: [OLD] })
    expect(link.verify(stranger)).toBe(false)
  })
})
