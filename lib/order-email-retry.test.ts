import { beforeEach, describe, expect, it, vi } from 'vitest'

const sendEmail = vi.fn()
const env = vi.fn()
const db = {
  claimDueRetries: vi.fn(),
  claimNoteForResend: vi.fn(),
  insertFailedEmailNote: vi.fn(),
  msUntilNextRetry: vi.fn(),
  openEmailsForShipment: vi.fn(),
  recordFailedTry: vi.fn(),
  setEmailNoteContent: vi.fn(),
  settleEmailNote: vi.fn(),
  stopExpiredRetries: vi.fn(),
}
const logOrderEmail = vi.fn()
const recordToldWindow = vi.fn()

vi.mock('@/lib/email/index', () => ({ sendEmail: (...a: unknown[]) => sendEmail(...a) }))
vi.mock('@/lib/cron/run', () => ({ cronCallEnvironment: () => env() }))
vi.mock('@/modules/shop/lib/db/order-email-retry', () => db)
vi.mock('@/modules/shop/lib/db/orders', () => ({ logOrderEmail: (...a: unknown[]) => logOrderEmail(...a) }))
vi.mock('@/modules/shop/lib/db/shipments', () => ({ recordToldWindow: (...a: unknown[]) => recordToldWindow(...a) }))

const fetchMock = vi.fn()
vi.stubGlobal('fetch', fetchMock)

const retry = await import('./order-email-retry')

const EMAIL = {
  trigger: 'DELIVERY_SLOT_CONFIRMED', to: 'd@example.com', subject: 'Order DW000245 booked in', html: '<p>h</p>', text: 't',
  shipmentId: 'shp-1', toldWindow: '2026-10-26 13:45-15:45',
}
const held = (over: Record<string, unknown> = {}) => ({
  id: 'note-1', orderId: 'ord-1', content: '', isInternal: true, createdBy: null, createdAt: new Date(),
  failedEmail: EMAIL, emailNextTryAt: new Date(), emailSettledAt: null, emailTries: 0, ...over,
})

beforeEach(() => {
  vi.clearAllMocks()
  env.mockReturnValue({ siteUrl: 'https://shop.example', secret: 's3cret' })
  fetchMock.mockResolvedValue(new Response(null, { status: 202 }))
  sendEmail.mockResolvedValue({})
  db.insertFailedEmailNote.mockResolvedValue('note-1')
  db.stopExpiredRetries.mockResolvedValue([])
  db.claimDueRetries.mockResolvedValue([])
  db.msUntilNextRetry.mockResolvedValue(null)
  db.openEmailsForShipment.mockResolvedValue([])
})

describe('a send that fails', () => {
  it('notes it as still trying, and starts the chain', async () => {
    await retry.noteFailedOrderEmail('ord-1', EMAIL, new Error('Greeting never received'))
    const [orderId, content, stored, schedule] = db.insertFailedEmailNote.mock.calls[0]!
    expect(orderId).toBe('ord-1')
    expect(content).toContain('Email not sent yet')
    expect(content).toContain('Greeting never received')
    expect(content).not.toContain('Use Resend below once that is fixed')
    expect(stored).toMatchObject({ shipmentId: 'shp-1', lastError: 'Greeting never received' })
    expect(schedule).toEqual({ forMs: 5 * 60_000, firstGapMs: 10_000 })
    expect(fetchMock).toHaveBeenCalledWith('https://shop.example/api/m/shop/cron/email-retry', expect.objectContaining({
      method: 'POST', headers: { Authorization: 'Bearer s3cret' },
    }))
  })

  it('on a site that cannot schedule, waits for Resend and says so', async () => {
    env.mockReturnValue({ error: 'CRON_SECRET is not configured' })
    await retry.noteFailedOrderEmail('ord-1', EMAIL, new Error('down'))
    const [, content, , schedule] = db.insertFailedEmailNote.mock.calls[0]!
    expect(content).toContain('Use Resend below')
    expect(schedule).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('Resend', () => {
  it('sends it as written, settles the note, and records the window the customer now has', async () => {
    db.claimNoteForResend.mockResolvedValue(held({ emailTries: 2 }))
    expect(await retry.resendHeldEmail('ord-1', 'note-1')).toEqual({ ok: true })
    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: 'd@example.com', subject: EMAIL.subject, threadKey: 'shop-order:ord-1' }))
    expect(db.settleEmailNote).toHaveBeenCalledWith('note-1', expect.stringContaining('went on try 4'))
    expect(logOrderEmail).toHaveBeenCalledWith('ord-1', EMAIL.subject, 'd@example.com', 'DELIVERY_SLOT_CONFIRMED')
    expect(recordToldWindow).toHaveBeenCalledWith('shp-1', 'ord-1', '2026-10-26 13:45-15:45')
  })

  it('stands back from a note already sent or being sent', async () => {
    db.claimNoteForResend.mockResolvedValue(null)
    expect(await retry.resendHeldEmail('ord-1', 'note-1')).toMatchObject({ ok: false, status: 409 })
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it('a refused Resend starts five fresh minutes of trying', async () => {
    db.claimNoteForResend.mockResolvedValue(held({ emailNextTryAt: null }))
    sendEmail.mockRejectedValue(new Error('still down'))
    db.recordFailedTry.mockResolvedValue(held({ emailTries: 1, emailNextTryAt: new Date() }))
    expect(await retry.resendHeldEmail('ord-1', 'note-1')).toMatchObject({ ok: false, status: 502, error: 'still down' })
    expect(db.recordFailedTry).toHaveBeenCalledWith('note-1', 'still down', { gapMs: 10_000, restartForMs: 5 * 60_000 })
    expect(db.setEmailNoteContent).toHaveBeenCalledWith('note-1', expect.stringContaining('has not gone after 2 tries'))
    expect(db.settleEmailNote).not.toHaveBeenCalled()
    expect(recordToldWindow).not.toHaveBeenCalled()
    expect(fetchMock).toHaveBeenCalled()
  })
})

describe('a link of the chain', () => {
  it('calls its successor before it sends, then sends what is due', async () => {
    const order: string[] = []
    fetchMock.mockImplementation(async () => { order.push('kick'); return new Response(null, { status: 202 }) })
    sendEmail.mockImplementation(async () => { order.push('send'); return {} })
    db.claimDueRetries.mockResolvedValue([held()])
    await retry.runRetryLink()
    expect(order).toEqual(['kick', 'send'])
    expect(db.settleEmailNote).toHaveBeenCalledWith('note-1', expect.stringContaining('went on try 2'))
  })

  it('an automatic try that fails for the last time leaves the note waiting for Resend', async () => {
    db.claimDueRetries.mockResolvedValue([held({ emailTries: 3 })])
    sendEmail.mockRejectedValue(new Error('Greeting never received'))
    db.recordFailedTry.mockResolvedValue(held({ emailTries: 4, emailNextTryAt: null }))
    await retry.runRetryLink()
    expect(db.recordFailedTry).toHaveBeenCalledWith('note-1', 'Greeting never received', { gapMs: 10_000, restartForMs: null })
    expect(db.setEmailNoteContent).toHaveBeenCalledWith('note-1', expect.stringContaining('Use Resend below'))
  })

  it('ends the chain when nothing is trying', async () => {
    await retry.runRetryLink()
    expect(fetchMock).not.toHaveBeenCalled()
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it('waits for the next try when it is due inside its own budget', async () => {
    vi.useFakeTimers()
    db.msUntilNextRetry.mockResolvedValueOnce(5_000)
    db.claimDueRetries.mockResolvedValueOnce([]).mockResolvedValueOnce([held()])
    const run = retry.runRetryLink()
    await vi.advanceTimersByTimeAsync(5_000)
    await run
    vi.useRealTimers()
    expect(sendEmail).toHaveBeenCalledTimes(1)
  })

  it('hands on when the next try is past its budget', async () => {
    vi.useFakeTimers()
    db.msUntilNextRetry.mockResolvedValueOnce(70_000)
    const run = retry.runRetryLink()
    await vi.advanceTimersByTimeAsync(40_000)
    await run
    vi.useRealTimers()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it('rewords the retries whose five minutes are up', async () => {
    db.stopExpiredRetries.mockResolvedValue([held({ emailTries: 5, failedEmail: { ...EMAIL, lastError: 'down' } })])
    await retry.runRetryLink()
    expect(db.setEmailNoteContent).toHaveBeenCalledWith('note-1', expect.stringMatching(/Tried 6 tries.*down.*Use Resend below/))
  })
})

describe('a newer email about the same parcel', () => {
  it('drops the unsent older delivery news rather than retry it after', async () => {
    db.openEmailsForShipment.mockResolvedValue([held()])
    await retry.dropReplacedEmails('ord-1', 'shp-1', 'DELIVERY_DELAYED')
    expect(db.openEmailsForShipment).toHaveBeenCalledWith('ord-1', 'shp-1', expect.arrayContaining(['DELIVERY_SLOT_CONFIRMED', 'DELIVERY_DELAYED']))
    expect(db.settleEmailNote).toHaveBeenCalledWith('note-1', expect.stringContaining('Email dropped'))
  })

  it('only replaces the same email otherwise', () => {
    expect(retry.triggersReplacedBy('TRACKING_ADDED')).toEqual(['TRACKING_ADDED'])
  })
})
