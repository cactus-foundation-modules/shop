import { prisma } from '@/lib/db/prisma'
import { INSTALLED_MODULE_WHERE } from '@/lib/modules/live-status'
import { getSessionFromCookie } from '@/lib/auth/session'
import { hasPermission } from '@/lib/permissions/check'
import { moduleExtensionPointComponents } from '@/lib/modules/extension-points'

// A generic, attribute-agnostic way for another module to hang extra per-PRODUCT
// fields on the shop. The product-level twin of shop-variations'
// `variant-field-provider`: that one adds columns to the Variations tab, keyed by
// variant; this one adds columns to the Products tab, keyed by the product itself.
//
// A module returns a set of columns that depends on the product being looked at
// (e.g. one per product-level attribute a product uses), so it can contribute a
// different number of columns per product. The same provider drives the
// Google-Sheet Products tab in both directions:
//   - Push adds each column to the sheet and fills it via `getValues`;
//   - Pull hands every row back through `applyImportedRow`, and the diff asks
//     `rowChanged` so a product whose only edit is one of these columns is not
//     mistaken for unchanged and dropped.
//
// Nothing here knows what the columns mean. Shop's own CSV upload/download is left
// untouched on purpose - these columns exist for the sheet sync, whose owner is
// the one module that consumes this point.

export type ProductFieldColumn = {
  /** Stable-per-product column key the provider recognises (opaque to us). */
  key: string
  /** Column heading. Also the sheet column header, so it must be stable per key. */
  label: string
  /** Where the column sits among the grid's own. Unordered columns go last. */
  order?: number
}

export type ProductFieldProvider = {
  /** Columns this provider contributes for the given product. Empty = none. */
  listColumns(productId: string): Promise<ProductFieldColumn[]>
  /** Per product, the value string for each of its column keys (for the Push). */
  getValues(productIds: string[]): Promise<Record<string, Record<string, string>>>
  /**
   * Optional import lifecycle. Called once, before any row is applied, with every
   * product id the Pull will touch, so a provider that diffs against current state
   * can preload it in one query and return an opaque context handed back to each
   * `applyImportedRow`. A product created mid-import is not in the list, so a
   * provider MUST treat a context miss as "empty current state".
   */
  beginImport?(productIds: string[]): Promise<unknown>
  /**
   * Apply one row's provider columns to a product. `row` is keyed by header label.
   * `ctx` is whatever `beginImport` returned. Returns whether anything was written,
   * so the Pull can count the product as changed rather than skipped.
   */
  applyImportedRow(productId: string, row: Record<string, string>, ctx?: unknown): Promise<boolean>
  /**
   * Would `applyImportedRow` write anything for this row? Read-only: the Pull's
   * diff calls this to decide whether a row whose fixed columns all match the shop
   * still has work in a provider column. MUST create, update or delete nothing.
   */
  rowChanged?(productId: string, row: Record<string, string>, ctx?: unknown): Promise<boolean>
}

const POINT = 'shop.product-field-provider'

type ManifestEntry = { point: string; id: string; permission?: string }

/**
 * Provider objects contributed by active modules through the
 * `shop.product-field-provider` point. Resolved from the stored manifests, like
 * the variant-field-provider resolver, because only a server context can read
 * them. Pass a `user` to gate columns by permission on an admin path; the
 * sheet-sync path runs behind its own route guard and needs no per-provider gate.
 */
export async function resolveProductFieldProviders(
  user?: Awaited<ReturnType<typeof getSessionFromCookie>>,
): Promise<Array<{ id: string; provider: ProductFieldProvider }>> {
  const modules = await prisma.module.findMany({
    where: { ...INSTALLED_MODULE_WHERE },
    select: { manifest: true },
  })
  const components = moduleExtensionPointComponents[POINT] ?? {}
  const out: Array<{ id: string; provider: ProductFieldProvider }> = []
  const seen = new Set<string>()
  for (const mod of modules) {
    const manifest = mod.manifest as { extensionPoints?: ManifestEntry[] } | null
    for (const entry of manifest?.extensionPoints ?? []) {
      if (entry.point !== POINT || seen.has(entry.id)) continue
      if (user && entry.permission && !(await hasPermission(user, entry.permission))) continue
      const provider = components[entry.id] as ProductFieldProvider | undefined
      if (provider) {
        out.push({ id: entry.id, provider })
        seen.add(entry.id)
      }
    }
  }
  return out
}
