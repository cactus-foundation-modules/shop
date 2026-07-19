import { prisma } from '@/lib/db/prisma'

// ---------------------------------------------------------------------------
// Suppliers sidebar link
//
// Core builds the admin sidebar from each module's stored manifest (the jsonb
// Module.manifest column), so a link that should only appear when a shop setting
// is on has to be added to and removed from that stored copy. This file owns
// both halves of that, and nothing outside the shop module knows about it.
//
// Two things to know about the stored copy:
//   - It is written from cactus.module.json at install and at module update, so
//     an update resets it back to "no Suppliers link". syncSupplierNavEntry is
//     therefore called on read paths an admin hits often (shop settings and the
//     dashboard widget), not only when the setting is saved, so the link comes
//     back on its own rather than needing the setting toggled again.
//   - It is only ever patched, never rewritten: the manifest is spread and only
//     navEntries replaced, so a field a newer core added survives untouched.
// ---------------------------------------------------------------------------

const SUPPLIERS_PATH = '/m/shop/suppliers'

const SUPPLIERS_NAV_ENTRY = {
  label: 'Suppliers',
  path: SUPPLIERS_PATH,
  icon: '<path d="M3 9h18v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9Z"/><path d="M3 9 5 4h14l2 5"/><path d="M10 13h4"/>',
  permission: 'shop.access',
}

type NavEntry = { label: string; path: string; icon?: string; permission?: string }

/**
 * Make the stored manifest's nav entries agree with `enabled`, writing only when
 * they currently disagree. Safe to call on any request path: the common case is
 * a single indexed read and no write at all.
 *
 * Never throws. A sidebar link is not worth failing a settings save or a
 * dashboard render over, so a failure here is swallowed and simply retried by
 * the next caller.
 */
export async function syncSupplierNavEntry(enabled: boolean): Promise<void> {
  try {
    const mod = await prisma.module.findUnique({ where: { name: 'shop' }, select: { manifest: true } })
    if (!mod?.manifest || typeof mod.manifest !== 'object' || Array.isArray(mod.manifest)) return

    const manifest = mod.manifest as Record<string, unknown>
    const entries = Array.isArray(manifest.navEntries) ? (manifest.navEntries as NavEntry[]) : []
    const present = entries.some((e) => e?.path === SUPPLIERS_PATH)
    if (present === enabled) return

    // Slot the link in after Collections when adding it, so it lands among the
    // catalogue links rather than after Reports. Falls back to the end if the
    // manifest has been reordered and Collections is not there.
    let next: NavEntry[]
    if (enabled) {
      const after = entries.findIndex((e) => e?.path === '/m/shop/collections')
      const at = after === -1 ? entries.length : after + 1
      next = [...entries.slice(0, at), SUPPLIERS_NAV_ENTRY, ...entries.slice(at)]
    } else {
      next = entries.filter((e) => e?.path !== SUPPLIERS_PATH)
    }

    await prisma.module.update({
      where: { name: 'shop' },
      data: { manifest: { ...manifest, navEntries: next } },
    })
  } catch {
    // Deliberately silent - see the doc comment.
  }
}
