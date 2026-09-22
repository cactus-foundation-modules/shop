import { readFileSync, readdirSync } from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'

// The manifest's `teardown` list is what core drops when an owner removes the
// shop with "Remove code and data", a choice the uninstall dialog describes as
// deleting all of the module's data for good. A table left off the list
// survives that - credit notes, with a customer's details on every one, used
// to - and because the same uninstall also forgets which
// migrations ran, a reinstall's CREATE TABLE IF NOT EXISTS then skips the
// leftover and quietly adopts whatever was in it.
//
// Nothing else checks the two agree: a migration adding a table type-checks,
// lints and builds whether or not anybody remembered the manifest. So this
// reads both and compares them.
const shopRoot = path.join(process.cwd(), 'modules/shop')

function tablesCreatedByMigrations(): Set<string> {
  const dir = path.join(shopRoot, 'migrations')
  const names = new Set<string>()
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.sql'))) {
    const sql = readFileSync(path.join(dir, file), 'utf8')
    for (const match of sql.matchAll(/CREATE TABLE (?:IF NOT EXISTS )?"?([a-z0-9_]+)"?/gi)) {
      names.add(match[1]!)
    }
  }
  return names
}

function teardownList(): string[] {
  const manifest = JSON.parse(readFileSync(path.join(shopRoot, 'cactus.module.json'), 'utf8')) as { teardown?: string[] }
  return manifest.teardown ?? []
}

describe('shop manifest teardown', () => {
  it('drops every table the migrations create', () => {
    const teardown = new Set(teardownList())
    const missing = [...tablesCreatedByMigrations()].filter((t) => !teardown.has(t)).sort()
    expect(missing).toEqual([])
  })

  // Core drops each entry with DROP TABLE, which fails outright on anything that
  // is not a table - a sequence, say - and would stop the uninstall part-way.
  it('names only tables the migrations create', () => {
    const created = tablesCreatedByMigrations()
    const strays = teardownList().filter((t) => !created.has(t))
    expect(strays).toEqual([])
  })
})
