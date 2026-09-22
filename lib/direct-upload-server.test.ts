import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { MediaProviderType } from '@prisma/client'

// checkLandedUpload is the only thing between a browser's say-so and a row the
// download route will later fetch from on the server. These pin the order it
// asks its questions in - key, then token, then storage - and that nothing it
// was not issued is ever looked up, deleted or recorded.

const headMediaSize = vi.fn(async (): Promise<number | null> => 1024)
const deleteMedia = vi.fn(async () => {})
const verifyUploadToken = vi.fn((): boolean => true)
let worker = 'https://media.example.test'

vi.mock('@/lib/media/upload', () => ({
  headMediaSize: (...a: unknown[]) => headMediaSize(...(a as [])),
  deleteMedia: (...a: unknown[]) => deleteMedia(...(a as [])),
  isS3Provider: (p: string) => ['B2', 'R2', 'S3', 'SPACES', 'WASABI', 'MINIO'].includes(p),
  mediaKeyPrefix: (p: string) => (p === 'B2' ? 'media/' : `media/${p}/`),
}))

vi.mock('@/lib/media/worker-url', () => ({
  workerUrl: () => worker,
}))

vi.mock('@/lib/media/upload-token', () => ({
  signUploadToken: (key: string) => ({ token: `signed:${key}`, exp: 0 }),
  verifyUploadToken: (...a: unknown[]) => verifyUploadToken(...(a as [])),
}))

import { checkLandedUpload, issueShopUploadTicket } from '@/modules/shop/lib/direct-upload-server'
import { buildShopUploadKey } from '@/modules/shop/lib/direct-upload'

const ID = '3f2a9c1e-7b4d-4e8a-9f10-2c3d4e5f6a7b'
const key = buildShopUploadKey('media/R2/', 'downloads', ID, 'manual.pdf')

const check = (over: Partial<Parameters<typeof checkLandedUpload>[0]> = {}) =>
  checkLandedUpload({
    provider: 'R2' as MediaProviderType,
    purpose: 'downloads',
    filename: 'manual.pdf',
    key,
    token: 'token',
    maxBytes: 50 * 1024 * 1024,
    ...over,
  })

beforeEach(() => {
  headMediaSize.mockReset().mockResolvedValue(1024)
  deleteMedia.mockReset().mockResolvedValue(undefined)
  verifyUploadToken.mockReset().mockReturnValue(true)
  worker = 'https://media.example.test'
})

describe('issueShopUploadTicket', () => {
  it('signs a key in the shop’s own folder for this purpose', () => {
    const ticket = issueShopUploadTicket('R2', 'imports', 'stock.csv')
    expect(ticket.available).toBe(true)
    if (!ticket.available) return
    expect(ticket.key).toMatch(/^media\/R2\/shop-files\/imports\/[0-9a-f-]{36}-stock\.csv\.bin$/)
    expect(ticket.uploadUrl).toBe(`https://media.example.test/${ticket.key}`)
    expect(ticket.token).toBe(`signed:${ticket.key}`)
    expect(ticket.contentType).toBe('application/octet-stream')
  })

  it('never hands out the same key twice', () => {
    const a = issueShopUploadTicket('R2', 'downloads', 'manual.pdf')
    const b = issueShopUploadTicket('R2', 'downloads', 'manual.pdf')
    expect(a.available && b.available && a.key !== b.key).toBe(true)
  })

  it('says the direct path is unavailable for storage the Worker cannot write to', () => {
    expect(issueShopUploadTicket('CLOUDINARY', 'downloads', 'manual.pdf')).toEqual({ available: false })
    worker = ''
    expect(issueShopUploadTicket('R2', 'downloads', 'manual.pdf')).toEqual({ available: false })
  })
})

describe('checkLandedUpload', () => {
  it('builds the url from the key and takes the size from storage', async () => {
    headMediaSize.mockResolvedValue(6_000_000)
    expect(await check()).toEqual({ ok: true, key, url: `https://media.example.test/${key}`, sizeBytes: 6_000_000 })
  })

  it('refuses a key it did not issue for this purpose and file, without asking storage anything', async () => {
    for (const bad of [
      'media/R2/abc-photo.jpg',
      buildShopUploadKey('media/R2/', 'imports', ID, 'manual.pdf'),
      buildShopUploadKey('media/R2/', 'downloads', ID, 'other.pdf'),
      'https://elsewhere.example/evil.pdf',
    ]) {
      const result = await check({ key: bad })
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.status).toBe(400)
    }
    expect(verifyUploadToken).not.toHaveBeenCalled()
    expect(headMediaSize).not.toHaveBeenCalled()
    expect(deleteMedia).not.toHaveBeenCalled()
  })

  it('refuses an expired or forged token and leaves the object alone', async () => {
    verifyUploadToken.mockReturnValue(false)
    const result = await check()
    expect(result).toMatchObject({ ok: false, status: 403 })
    expect(headMediaSize).not.toHaveBeenCalled()
    expect(deleteMedia).not.toHaveBeenCalled()
  })

  it('refuses an object storage cannot find', async () => {
    headMediaSize.mockResolvedValue(null)
    expect(await check()).toMatchObject({ ok: false, status: 502 })
    expect(deleteMedia).not.toHaveBeenCalled()
  })

  it('removes and refuses an object over the ceiling, with the advice given', async () => {
    headMediaSize.mockResolvedValue(21 * 1024 * 1024)
    const result = await check({ maxBytes: 20 * 1024 * 1024, tooLargeAdvice: 'Split it.' })
    expect(result).toMatchObject({ ok: false, status: 413 })
    if (!result.ok) expect(result.error).toBe('"manual.pdf": File size 21.0 MB exceeds the 20 MB limit. Split it.')
    expect(deleteMedia).toHaveBeenCalledWith('R2', key)
  })

  it('removes and refuses an empty object', async () => {
    headMediaSize.mockResolvedValue(0)
    expect(await check()).toMatchObject({ ok: false, status: 400 })
    expect(deleteMedia).toHaveBeenCalledWith('R2', key)
  })

  it('still answers when the tidy-up itself fails', async () => {
    headMediaSize.mockResolvedValue(60 * 1024 * 1024)
    deleteMedia.mockRejectedValue(new Error('storage down'))
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await check()).toMatchObject({ ok: false, status: 413 })
    quiet.mockRestore()
  })

  it('refuses outright when the Worker has gone from the set-up since the key was issued', async () => {
    worker = ''
    expect(await check()).toMatchObject({ ok: false, status: 400 })
    expect(headMediaSize).not.toHaveBeenCalled()
  })
})
