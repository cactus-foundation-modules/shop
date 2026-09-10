import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import {
  documentPagePath,
  PRINT_TOKEN_TTL_MINUTES,
  signDocumentPrintToken,
  verifyDocumentPrintToken,
} from '@/modules/shop/lib/document-print-token'

beforeAll(() => {
  process.env.ENCRYPTION_KEY = 'a-test-key-that-is-at-least-32-characters-long'
})

afterEach(() => {
  vi.useRealTimers()
})

describe('document print token', () => {
  it('verifies the token it issued', () => {
    expect(verifyDocumentPrintToken('invoice', 'INV-000087', signDocumentPrintToken('invoice', 'INV-000087'))).toBe(true)
  })

  it('refuses another document of the same kind', () => {
    const token = signDocumentPrintToken('invoice', 'INV-000087')
    expect(verifyDocumentPrintToken('invoice', 'INV-000088', token)).toBe(false)
  })

  // The reason the kind is inside the signature: a shop may number its credit
  // notes and its invoices from the same series.
  it('refuses the same number of a different kind', () => {
    const token = signDocumentPrintToken('credit-note', 'INV-000087')
    expect(verifyDocumentPrintToken('invoice', 'INV-000087', token)).toBe(false)
    expect(verifyDocumentPrintToken('proforma', 'INV-000087', token)).toBe(false)
  })

  // The whole point of it being short-lived: a print URL pasted into a chat has
  // stopped working by the time anybody clicks it.
  it('stops verifying once it has aged out', () => {
    const token = signDocumentPrintToken('invoice', 'INV-000087')
    vi.useFakeTimers()
    vi.setSystemTime(new Date(Date.now() + (PRINT_TOKEN_TTL_MINUTES + 1) * 60_000))
    expect(verifyDocumentPrintToken('invoice', 'INV-000087', token)).toBe(false)
  })

  it('still verifies inside its window', () => {
    const token = signDocumentPrintToken('invoice', 'INV-000087')
    vi.useFakeTimers()
    vi.setSystemTime(new Date(Date.now() + (PRINT_TOKEN_TTL_MINUTES - 1) * 60_000))
    expect(verifyDocumentPrintToken('invoice', 'INV-000087', token)).toBe(true)
  })

  // A token whose expiry has been edited to a later minute has to fail, or the
  // whole thing is a suggestion rather than a limit.
  it('refuses a token whose expiry has been moved', () => {
    const token = signDocumentPrintToken('invoice', 'INV-000087')
    const [, signature] = token.split('.')
    const later = Math.floor(Date.now() / 60_000) + 60 * 24
    expect(verifyDocumentPrintToken('invoice', 'INV-000087', `${later}.${signature}`)).toBe(false)
  })

  it('refuses rubbish rather than throwing', () => {
    expect(verifyDocumentPrintToken('invoice', 'INV-000087', '')).toBe(false)
    expect(verifyDocumentPrintToken('invoice', 'INV-000087', null)).toBe(false)
    expect(verifyDocumentPrintToken('invoice', 'INV-000087', 'not-a-token')).toBe(false)
    expect(verifyDocumentPrintToken('invoice', 'INV-000087', '.')).toBe(false)
    expect(verifyDocumentPrintToken('invoice', '', signDocumentPrintToken('invoice', ''))).toBe(false)
  })

  it('carries nothing about the document in the clear', () => {
    expect(signDocumentPrintToken('invoice', 'INV-000087')).not.toContain('INV-000087')
  })
})

describe('document page paths', () => {
  it('points at each document own page', () => {
    expect(documentPagePath('invoice', 'INV-000087')).toBe('/shop/invoice/INV-000087')
    expect(documentPagePath('credit-note', 'CN-000012')).toBe('/shop/credit-note/CN-000012')
    expect(documentPagePath('proforma', 'DW000188')).toBe('/shop/proforma/DW000188')
  })

  it('escapes a number that would otherwise change the address', () => {
    expect(documentPagePath('invoice', 'INV 87/A')).toBe('/shop/invoice/INV%2087%2FA')
  })
})
