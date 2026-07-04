// PROTECTED - signed token, no DB lookup needed to validate (addendum A.5).
import { createHmac, timingSafeEqual } from 'crypto'

function getKey(): string {
  const key = process.env.ENCRYPTION_KEY
  if (!key) throw new Error('ENCRYPTION_KEY is not set - required for back-in-stock unsubscribe links.')
  return key
}

export function signUnsubscribeToken(productId: string, email: string): string {
  const payload = `${productId}:${email.toLowerCase()}`
  const signature = createHmac('sha256', getKey()).update(payload).digest('hex')
  return Buffer.from(`${payload}:${signature}`).toString('base64url')
}

export function verifyUnsubscribeToken(token: string): { productId: string; email: string } | null {
  try {
    const decoded = Buffer.from(token, 'base64url').toString('utf8')
    const parts = decoded.split(':')
    if (parts.length !== 3) return null
    const [productId, email, signature] = parts as [string, string, string]
    const expected = createHmac('sha256', getKey()).update(`${productId}:${email}`).digest('hex')
    const a = Buffer.from(signature)
    const b = Buffer.from(expected)
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null
    return { productId, email }
  } catch {
    return null
  }
}
