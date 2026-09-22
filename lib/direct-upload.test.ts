import { describe, it, expect } from 'vitest'
import { MAX_DIRECT_UPLOAD_BYTES, MAX_UPLOAD_BYTES, MAX_UPLOAD_MB } from '@/lib/media/limits'
import {
  DIGITAL_FILE_MAX_BYTES,
  IMPORT_CSV_MAX_BYTES,
  buildShopUploadKey,
  directUnavailableMessage,
  isShopUploadKey,
  keyNameFor,
  needsDirectUpload,
  shopUploadDirectory,
} from '@/modules/shop/lib/direct-upload'

// isShopUploadKey is what stops a caller pointing the shop at an object it was
// never issued - somebody else's private file, or a url the download route would
// then fetch on the server. keyNameFor is what keeps a signed key identical to
// the path the browser actually sends. Both are dull rules that only have to be
// wrong once, hence the dull tests.

const ID = '3f2a9c1e-7b4d-4e8a-9f10-2c3d4e5f6a7b'
const R2 = 'media/R2/'
const B2 = 'media/'

describe('keyNameFor', () => {
  it('leaves a plain name alone', () => {
    expect(keyNameFor('manual.pdf')).toBe('manual.pdf')
  })

  it('turns spaces and punctuation a url would encode into hyphens', () => {
    expect(keyNameFor('Owner manual (v2) + extras.pdf')).toBe('Owner-manual-v2-extras.pdf')
  })

  it('drops accents rather than the letters under them', () => {
    expect(keyNameFor('Guide d’entretien modèle.pdf')).toBe('Guide-d-entretien-modele.pdf')
  })

  it('keeps only the last part of anything path-shaped', () => {
    expect(keyNameFor('C:\\Users\\sam\\stock.csv')).toBe('stock.csv')
    expect(keyNameFor('../../etc/passwd')).toBe('passwd')
  })

  it('never produces an empty, dot-only or hidden name', () => {
    expect(keyNameFor('')).toBe('file')
    expect(keyNameFor('...')).toBe('file')
    expect(keyNameFor('.env')).toBe('env')
    expect(keyNameFor('日本語')).toBe('file')
  })

  it('clips a very long name without leaving a dangling dot or hyphen', () => {
    const name = keyNameFor(`${'a'.repeat(79)}-${'b'.repeat(40)}.pdf`)
    expect(name.length).toBeLessThanOrEqual(80)
    expect(name).not.toMatch(/[.-]$/)
  })

  it('only ever uses characters a url carries unchanged', () => {
    for (const raw of ['Price list £ 2026.csv', 'a+b=c&d.zip', 'späte Grüße.txt', 'tab\there.pdf', '100%.pdf']) {
      const name = keyNameFor(raw)
      expect(encodeURIComponent(name)).toBe(name)
    }
  })
})

describe('buildShopUploadKey', () => {
  it('files each purpose under the shop’s own folder inside the provider prefix', () => {
    expect(buildShopUploadKey(R2, 'downloads', ID, 'manual.pdf')).toBe(`media/R2/shop-files/downloads/${ID}-manual.pdf.bin`)
    expect(buildShopUploadKey(B2, 'imports', ID, 'stock.csv')).toBe(`media/shop-files/imports/${ID}-stock.csv.bin`)
  })

  it('always ends in the one extension the Worker stores as opaque bytes', () => {
    expect(buildShopUploadKey(R2, 'downloads', ID, 'page.html')).toMatch(/\.bin$/)
  })

  it('builds a key whose every segment survives a url unchanged', () => {
    const key = buildShopUploadKey(R2, 'downloads', ID, 'Grüße & co (final).pdf')
    for (const segment of key.split('/')) expect(encodeURIComponent(segment)).toBe(segment)
  })
})

describe('isShopUploadKey', () => {
  const key = buildShopUploadKey(R2, 'downloads', ID, 'manual.pdf')

  it('accepts the key it would have signed for this file', () => {
    expect(isShopUploadKey(key, R2, 'downloads', 'manual.pdf')).toBe(true)
  })

  it('accepts it however the same name was spelt, since only the tidied form is in the key', () => {
    const odd = buildShopUploadKey(R2, 'downloads', ID, 'My manual.pdf')
    expect(isShopUploadKey(odd, R2, 'downloads', 'My manual.pdf')).toBe(true)
  })

  it('refuses a key signed for another purpose', () => {
    expect(isShopUploadKey(key, R2, 'imports', 'manual.pdf')).toBe(false)
  })

  it('refuses a key under another provider', () => {
    expect(isShopUploadKey(key, 'media/S3/', 'downloads', 'manual.pdf')).toBe(false)
    expect(isShopUploadKey(key, B2, 'downloads', 'manual.pdf')).toBe(false)
  })

  it('refuses a key for a different file than the one being recorded', () => {
    expect(isShopUploadKey(key, R2, 'downloads', 'other.pdf')).toBe(false)
  })

  it('refuses anything else in the bucket', () => {
    expect(isShopUploadKey('media/R2/abc-photo.jpg', R2, 'downloads', 'photo.jpg')).toBe(false)
    expect(isShopUploadKey(`media/R2/unified-inbox/outbound/${ID}-manual.pdf.bin`, R2, 'downloads', 'manual.pdf')).toBe(false)
  })

  it('refuses a key that climbs out of the folder', () => {
    const dir = shopUploadDirectory(R2, 'downloads')
    expect(isShopUploadKey(`${dir}../../${ID}-manual.pdf.bin`, R2, 'downloads', 'manual.pdf')).toBe(false)
    expect(isShopUploadKey(`${dir}x/${ID}-manual.pdf.bin`, R2, 'downloads', 'manual.pdf')).toBe(false)
  })

  it('refuses a made-up upload id', () => {
    expect(isShopUploadKey(`${shopUploadDirectory(R2, 'downloads')}guess-manual.pdf.bin`, R2, 'downloads', 'manual.pdf')).toBe(false)
  })

  it('refuses anything tacked on the end', () => {
    expect(isShopUploadKey(`${key}.html`, R2, 'downloads', 'manual.pdf')).toBe(false)
    expect(isShopUploadKey(key.replace(/\.bin$/, '.pdf'), R2, 'downloads', 'manual.pdf')).toBe(false)
  })

  it('treats a name full of pattern characters as text', () => {
    const name = 'a.b*c+(d).pdf'
    const ok = buildShopUploadKey(R2, 'downloads', ID, name)
    expect(isShopUploadKey(ok, R2, 'downloads', name)).toBe(true)
    expect(isShopUploadKey(ok.replace('a.b', 'aXb'), R2, 'downloads', name)).toBe(false)
  })
})

describe('ceilings', () => {
  it('sends only what the site cannot carry itself the direct way', () => {
    expect(needsDirectUpload(MAX_UPLOAD_BYTES)).toBe(false)
    expect(needsDirectUpload(MAX_UPLOAD_BYTES + 1)).toBe(true)
  })

  it('holds a download to what a buyer can fetch inside the route\'s minute, and no more than the Worker will take', () => {
    expect(DIGITAL_FILE_MAX_BYTES).toBe(20 * 1024 * 1024)
    expect(DIGITAL_FILE_MAX_BYTES).toBeGreaterThan(MAX_UPLOAD_BYTES)
    expect(DIGITAL_FILE_MAX_BYTES).toBeLessThanOrEqual(MAX_DIRECT_UPLOAD_BYTES)
  })

  it('holds a sheet to more than the form could carry and no more than the Worker will take', () => {
    expect(IMPORT_CSV_MAX_BYTES).toBeGreaterThan(MAX_UPLOAD_BYTES)
    expect(IMPORT_CSV_MAX_BYTES).toBeLessThanOrEqual(MAX_DIRECT_UPLOAD_BYTES)
  })
})

describe('directUnavailableMessage', () => {
  it('names the file, its size, the limit and where to fix it', () => {
    const message = directUnavailableMessage({ name: 'manual.pdf', size: 6 * 1024 * 1024 })
    expect(message).toContain('"manual.pdf" is 6.0 MB')
    expect(message).toContain(`${MAX_UPLOAD_MB} MB`)
    expect(message).toContain('Settings → Media')
  })
})
