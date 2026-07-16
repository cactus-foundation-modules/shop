import { describe, it, expect } from 'vitest'
import { contentDisposition, downloadFilename } from '@/modules/shop/lib/download-name'

// The header this builds is the one place a name the site owner supplied reaches
// a response header, so the sanitising is a security check rather than a nicety -
// and it is the kind of check that reads as obviously correct right up until a
// character class turns out to hide a range. Hence the dull, exhaustive tests.

describe('downloadFilename', () => {
  it('leaves an ordinary filename alone', () => {
    expect(downloadFilename('TZ-4491-rev-c.pdf')).toBe('TZ-4491-rev-c.pdf')
  })

  it('keeps spaces, hyphens, apostrophes and accents', () => {
    expect(downloadFilename("Guide d'entretien - modèle 4491.pdf")).toBe("Guide d'entretien - modèle 4491.pdf")
  })

  it('keeps an exclamation mark, which the obvious character class quietly eats', () => {
    expect(downloadFilename('Read me first!.pdf')).toBe('Read me first!.pdf')
  })

  it('strips quotes, slashes and backslashes', () => {
    expect(downloadFilename('a"b/c\\d.pdf')).toBe('a b c d.pdf')
  })

  it('strips control characters rather than emitting them', () => {
    expect(downloadFilename('Manual\r\nX-Injected: yes.pdf')).toBe('Manual X-Injected: yes.pdf')
  })

  it('strips DEL', () => {
    expect(downloadFilename('Manual\x7f.pdf')).toBe('Manual .pdf')
  })

  it('collapses runs of whitespace and trims the ends', () => {
    expect(downloadFilename('  Manual   v2.pdf  ')).toBe('Manual v2.pdf')
  })

  it('falls back to a name when the filename sanitises away to nothing', () => {
    expect(downloadFilename('///')).toBe('download')
  })

  it('copes with a file that has no extension at all', () => {
    expect(downloadFilename('README')).toBe('README')
  })
})

describe('contentDisposition', () => {
  it('always attaches, and never renders', () => {
    expect(contentDisposition('manual.pdf')).toMatch(/^attachment; /)
  })

  it('emits both an ASCII filename and a UTF-8 one', () => {
    expect(contentDisposition('Manual.pdf')).toBe(`attachment; filename="Manual.pdf"; filename*=UTF-8''Manual.pdf`)
  })

  it('folds a non-ASCII name for the legacy parameter and encodes the real one', () => {
    const header = contentDisposition('模型.pdf')
    expect(header).toContain('filename="__.pdf"')
    expect(header).toContain(`filename*=UTF-8''${encodeURIComponent('模型.pdf')}`)
  })

  // The one that matters: a CR/LF in the name must not be able to end the header
  // and start another.
  it('cannot be used to inject a second header', () => {
    const header = contentDisposition('a\r\nX-Evil: 1.pdf')
    expect(header).not.toContain('\r')
    expect(header).not.toContain('\n')
  })

  it('cannot be used to close the quoted parameter early', () => {
    const header = contentDisposition('a"; evil="1.pdf')
    // Exactly two quotes: the pair around the ASCII filename.
    expect(header.split('"')).toHaveLength(3)
  })
})
