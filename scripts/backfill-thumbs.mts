// Make the 300px copies for a catalogue that predates them, from a terminal.
//
//   export DATABASE_URL=... DIRECT_URL=...   # plus the storage provider's own vars
//   npx tsx --tsconfig tsconfig.json modules/shop/scripts/backfill-thumbs.mts --dry-run
//   npx tsx --tsconfig tsconfig.json modules/shop/scripts/backfill-thumbs.mts
//
// Run from the REPO ROOT, not from the module folder - the `@/` paths resolve
// against the root tsconfig.
//
// Deliberately a terminal job rather than a button. It reads every product
// photograph in the shop once (3.76 GB on the install this was written for),
// decodes it, encodes a small copy and uploads that - hours of work and several
// gigabytes of transfer. Doing it on the machine sitting in front of you costs
// nothing; doing it in a serverless function costs a fortune and gets killed
// halfway through anyway. Everything it does is restartable, so a laptop that
// goes to sleep loses a batch and no more.
//
// Flags:
//   --dry-run          report what is outstanding and stop
//   --files-only       make the copies but write no product rows (see below)
//   --after=<url>      resume a --files-only run from the url it last reported
//   --limit=<n>        stop after n pictures (default: keep going until done)
//   --batch=<n>        pictures per pass (default 200)
//   --concurrency=<n>  pictures in flight at once (default 4)
//
// --files-only exists because the two halves of this job become available at
// different times on a shop that predates the feature. Making the copies needs
// nothing but the media library and is the half that takes hours; pointing the
// product rows at them needs the `thumb_url` column, which arrives with the
// module's migration on the install's next deploy. Run --files-only now, update
// the site, then run the ordinary form - it will find every copy already made and
// spend its time writing the column.
//
// Why .mts and why a runner at all: this repo has no local tsx, and the shop's
// import graph require()s Puck's CSS, which node cannot load. Both are dealt with
// below. See the module script notes in CLAUDE.md.

import Module from 'module'

// Puck ships CSS that the shop's import graph pulls in through a require().
// Stubbed both ways - the CJS extension hook for require(), a loader hook for
// import - because which one fires depends on how far down the graph the CSS is.
type Extensions = Record<string, (m: unknown, filename: string) => void>
;(Module as unknown as { _extensions: Extensions })._extensions['.css'] = () => {}
// The hook's own url, used as-is. Round-tripping it through pathToFileURL()
// encodes the already-encoded space in "Git Local" a second time and node then
// looks for a directory called "Git%20Local".
Module.register?.(new URL('./css-stub-hook.mjs', import.meta.url).href, import.meta.url)

const args = process.argv.slice(2)
const flag = (name: string): string | undefined =>
  args.find((a) => a.startsWith(`--${name}=`))?.split('=')[1]
const dryRun = args.includes('--dry-run')
const filesOnly = args.includes('--files-only')
const batch = Number(flag('batch') ?? 200)
const concurrency = Number(flag('concurrency') ?? 4)
const limitArg = flag('limit')
const limit = limitArg ? Number(limitArg) : Number.POSITIVE_INFINITY

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set. Export it for this run only - never write it into the repo.')
  process.exit(1)
}

// Destructured off the namespace rather than imported by name: the module lib
// compiles to CJS here and a static named import finds nothing.
const mod = await import('@/modules/shop/lib/thumb-backfill')
const countProductThumbsPending = mod.countProductThumbsPending ?? mod.default?.countProductThumbsPending
const backfillProductThumbs = mod.backfillProductThumbs ?? mod.default?.backfillProductThumbs
const backfillThumbFiles = mod.backfillThumbFiles ?? mod.default?.backfillThumbFiles

if (filesOnly) {
  const started = Date.now()
  let after = flag('after') ?? ''
  let seen = 0
  let copies = 0
  // A page that throws must not end the run. Whatever went wrong - a storage
  // hiccup, a picture the decoder will not touch, a name that would not resolve -
  // it applies to one page of three hundred, and the walk is ordered by url with
  // the cursor already past them. Stepping over it and carrying on is right;
  // losing four hours of work to it is not. Anything skipped is simply a picture
  // with no small copy, which renders from the original and is picked up by the
  // next sweep.
  let stumbles = 0
  for (;;) {
    if (seen >= limit) break
    let result
    try {
      result = await backfillThumbFiles({ after, pageSize: batch, concurrency })
    } catch (err) {
      stumbles += 1
      console.error(`Page starting after '${after}' failed (${stumbles} so far), stepping over it:`, err)
      // Nudge the cursor past the page that failed rather than re-reading it
      // forever. The next page starts from the last url this one reported, so a
      // page that cannot be read at all costs the pictures in it and nothing else.
      const next = await backfillThumbFiles({ after, pageSize: 1, concurrency: 1 }).catch(() => null)
      if (!next?.lastUrl || next.lastUrl === after) break
      after = next.lastUrl
      continue
    }
    if (result.seen === 0 && !result.more) break
    seen += result.seen
    copies += result.copied
    after = result.lastUrl ?? after
    const mins = (Date.now() - started) / 60000
    console.log(
      `${seen.toLocaleString()} pictures, ${copies.toLocaleString()} with a copy ` +
      `- ${Math.round(mins > 0 ? seen / mins : 0)}/min - resume with --after='${after}'`,
    )
    if (!result.more) break
  }
  console.log(
    `Finished making copies: ${copies.toLocaleString()} of ${seen.toLocaleString()} pictures, ` +
    `${Math.round((Date.now() - started) / 60000)} minutes` +
    (stumbles > 0 ? `, ${stumbles} page(s) stepped over` : '') + '.',
  )
  console.log('Now release the module, update the site, and run this again without --files-only to point the products at them.')
  process.exit(0)
}

const pending = await countProductThumbsPending()
console.log(`${pending.toLocaleString()} product pictures with no small copy.`)

if (dryRun) {
  const sample = await backfillProductThumbs({ limit: Math.min(batch, pending), dryRun: true })
  console.log(
    `Dry run over ${sample.seen.toLocaleString()} of them: ` +
    `${sample.copied.toLocaleString()} already have a copy on file, ` +
    `${sample.skipped.toLocaleString()} would be made.`,
  )
  process.exit(0)
}

const started = Date.now()
let done = 0
let made = 0
let rows = 0

for (;;) {
  if (done >= limit) break
  const size = Math.min(batch, limit - done)
  const result = await backfillProductThumbs({ limit: size, concurrency })
  if (result.seen === 0) break
  done += result.seen
  made += result.copied
  rows += result.rowsUpdated

  const mins = (Date.now() - started) / 60000
  const rate = mins > 0 ? done / mins : 0
  const left = Math.max(0, pending - done)
  const eta = rate > 0 ? `${Math.round(left / rate)} min left` : 'working out the rate'
  console.log(
    `${done.toLocaleString()}/${pending.toLocaleString()} done ` +
    `- ${made.toLocaleString()} copies, ${rows.toLocaleString()} rows pointed at one ` +
    `- ${Math.round(rate)}/min, ${eta}`,
  )
  if (!result.more) break
}

console.log(
  `Finished: ${made.toLocaleString()} small copies over ${done.toLocaleString()} pictures, ` +
  `${rows.toLocaleString()} product media rows updated, ` +
  `${Math.round((Date.now() - started) / 60000)} minutes.`,
)
process.exit(0)
