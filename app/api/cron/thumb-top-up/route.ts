import { NextRequest, NextResponse } from 'next/server'
import { errorResponse } from '@/lib/utils'
import { backfillProductThumbs, countProductThumbsPending } from '@/modules/shop/lib/thumb-backfill'

// The safety net under the small copies of product pictures.
//
// Saving a product makes the copies for its photographs (setProductMedia), and
// that covers the ordinary case: somebody adds a picture, the copy exists a moment
// later. It cannot cover everything. A bulk import writes hundreds of products in
// one request and is deliberately not allowed to sit there resizing; a picture on a
// host we cannot read comes back empty; a copy can simply fail. Each of those
// leaves a row with no small copy, which renders from the original - right, but
// heavier than it needs to be, on the page where it matters most.
//
// So once a night, whatever is outstanding gets picked up. Deliberately a TRICKLE
// and not a backfill: a shop switching this on for the first time has tens of
// thousands of photographs and several gigabytes to read, which belongs in the
// terminal (modules/shop/scripts/backfill-thumbs.mts) rather than in a nightly
// function. What this is for is the handful that arrive between one night and the
// next, and a catalogue that has already been swept stays swept.
const NIGHTLY_LIMIT = 60

// Module routes get sixty seconds. Leaving a third of it spare so the run reports
// what it managed rather than being cut off mid-upload with nothing written - the
// count is what tells an owner whether this is keeping up.
const BUDGET_MS = 40_000

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

async function handle(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) return errorResponse('CRON_SECRET is not configured', 503)
  const auth = request.headers.get('authorization')
  if (auth !== `Bearer ${secret}`) return errorResponse('Unauthorized', 401)

  // A failure is answered with an error status and says what it was: core's
  // Schedules page records a job as failed only on one, and shows `error`
  // beside it. Both of these used to be swallowed - a count that could not be
  // read looked like "nothing to do", and a pass that threw ended the run with
  // `ok: true` - so a store that had stopped taking copies read as a quiet night.
  let pendingBefore: number
  try {
    pendingBefore = await countProductThumbsPending()
  } catch (err) {
    console.error('[shop] thumb top-up could not count the pictures waiting', err)
    return NextResponse.json({ ok: false, error: `Could not see which pictures still need small copies: ${errorMessage(err)}` }, { status: 500 })
  }
  if (pendingBefore === 0) return NextResponse.json({ ok: true, pending: 0, copied: 0, rowsUpdated: 0 })

  const startedAt = Date.now()
  let copied = 0
  let rowsUpdated = 0
  let seen = 0
  let failure: string | null = null

  // In small passes rather than one big one, so the budget can be honoured between
  // them: a single pass has no way to stop partway and keep what it has done.
  while (seen < NIGHTLY_LIMIT && Date.now() - startedAt < BUDGET_MS) {
    let result: Awaited<ReturnType<typeof backfillProductThumbs>>
    try {
      result = await backfillProductThumbs({ limit: 10, concurrency: 3 })
    } catch (err) {
      // What the passes before this one did is kept - each is written as it
      // goes - so the run stops here and says so rather than pressing on into
      // the same fault.
      console.error('[shop] thumb top-up pass failed', err)
      failure = errorMessage(err)
      break
    }
    if (result.seen === 0) break
    seen += result.seen
    copied += result.copied
    rowsUpdated += result.rowsUpdated
    if (!result.more) break
  }

  if (failure) {
    return NextResponse.json({
      ok: false,
      error: `Making small copies of product pictures stopped after ${seen} of ${pendingBefore}: ${failure}`,
      pending: pendingBefore,
      seen,
      copied,
      rowsUpdated,
      ms: Date.now() - startedAt,
    }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    // What was outstanding when this started, so a glance at the log says whether
    // the nightly trickle is keeping up or whether the catalogue wants the
    // terminal sweep run over it once.
    pending: pendingBefore,
    seen,
    copied,
    rowsUpdated,
    ms: Date.now() - startedAt,
  })
}

export async function GET(request: NextRequest) {
  return handle(request)
}

export async function POST(request: NextRequest) {
  return handle(request)
}
