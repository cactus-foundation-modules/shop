import { readFileSync, readdirSync, statSync } from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'

// A static backstop for a fault that cost a live shop every refund it tried.
//
// `pg_advisory_xact_lock` returns `void`, and Prisma has no mapping for that
// type: `$queryRaw` tries to deserialise the column and throws "Failed to
// deserialize column of type 'void'" on every call, without exception.
// `$executeRaw` asks for no deserialisation and is correct.
//
// Nothing else would have caught it. It type-checks, it lints, and the unit
// tests never reach a database - so `settleRefund` threw the first time a real
// refund was settled, after the reservation row had already been committed,
// leaving the refund stranded and the order untouched. `deleteShipment` carried
// the identical line and would have done the same to anyone undoing a dispatch.
//
// So: no `$queryRaw` may call a void-returning function. The list is short and
// deliberately so - add to it when another one bites.
const VOID_RETURNING = [
  'pg_advisory_xact_lock',
  'pg_advisory_lock',
  'pg_advisory_unlock_all',
  'pg_sleep',
]

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.next' || entry.startsWith('.')) continue
    const full = path.join(dir, entry)
    if (statSync(full).isDirectory()) sourceFiles(full, out)
    else if (full.endsWith('.ts') || full.endsWith('.tsx')) out.push(full)
  }
  return out
}

describe('raw SQL never asks Prisma to deserialise void', () => {
  it('uses $executeRaw for every void-returning function call', () => {
    const root = path.join(process.cwd(), 'modules/shop')
    const offenders: string[] = []

    for (const file of sourceFiles(root)) {
      if (file.endsWith('raw-void-calls.test.ts')) continue
      const source = readFileSync(file, 'utf8')
      source.split('\n').forEach((line, index) => {
        if (!line.includes('$queryRaw')) return
        for (const fn of VOID_RETURNING) {
          // `pg_try_advisory_xact_lock` contains `pg_advisory_xact_lock` as a
          // substring but returns boolean, so it is explicitly not an offender.
          if (line.includes(`pg_try_${fn.replace(/^pg_/, '')}`)) continue
          if (line.includes(`${fn}(`)) {
            offenders.push(`${path.relative(process.cwd(), file)}:${index + 1} - ${fn} through $queryRaw`)
          }
        }
      })
    }

    expect(offenders).toEqual([])
  })
})
