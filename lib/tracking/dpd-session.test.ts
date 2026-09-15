import { describe, expect, it } from 'vitest'
import { setCookieLines } from '@/modules/shop/lib/tracking/dpd-session'

describe('setCookieLines', () => {
  it('reads sessionId from getSetCookie when the runtime has it', () => {
    const res = {
      headers: {
        getSetCookie: () => ['sessionId=abc; Path=/; HttpOnly'],
        get: () => null,
      },
    } as unknown as Response
    expect(setCookieLines(res)).toEqual(['sessionId=abc; Path=/; HttpOnly'])
  })

  it('falls back to the combined set-cookie header', () => {
    const res = {
      headers: {
        getSetCookie: undefined,
        get: (name: string) => (name === 'set-cookie' ? 'sessionId=abc; Path=/; HttpOnly' : null),
      },
    } as unknown as Response
    expect(setCookieLines(res)).toEqual(['sessionId=abc; Path=/; HttpOnly'])
  })
})
