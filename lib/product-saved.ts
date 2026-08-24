// Fired after a product row has been written, for modules that keep something
// else in step with it. Shop stays generic: it knows nothing about what a
// listener does, only that a companion module can register a
// `shop.product-saved` hook and be told which fields the write carried.
//
// The case that forced it: shop-variations gives every variation a child product
// row of its own, and the basket rates a line from the CHILD's tax class. A tax
// class is a property of the listing, not of one size or colour - the editor
// only ever offers it on the parent - so a class set or changed after the
// variations were generated never reached them, and the same chair was quoted
// with VAT on the page and without it in the basket.
//
// Fired from updateProduct rather than from the admin route so the CSV upload and
// the Google-Sheet Pull, which write products by the hundred without going near a
// route handler, are covered by the same three lines.
//
// Providers MUST be server-safe (this runs inside lib/db) and MUST NOT throw the
// caller's save away: anything raised here is logged and swallowed, because a
// listener falling over is never a good enough reason to fail the owner's edit.
import { getInstalledManifests } from '@/lib/modules/live-status'
import { moduleExtensionPointComponents } from '@/lib/modules/extension-points'

/** `changed` names only the fields the write actually carried, so a hook can do
 *  nothing at all on the overwhelming majority of saves. */
export type ProductSavedHook = (productId: string, changed: readonly string[]) => Promise<void> | void

const POINT = 'shop.product-saved'

type ExtensionPointEntry = { point: string; id: string }

// The installed-module read is memoised in core (lib/modules/live-status), for
// the reason this file needed it first: a bulk import calls updateProduct once
// per row, and a Module.findMany per row is a query fan for a list that changes
// only when a module is installed or removed.

/** The hooks installed modules contribute, in manifest order. [] on a shop-only
 *  site - and, crucially, [] with no query at all when the build contains no
 *  module that declares the point. */
export async function getProductSavedHooks(): Promise<ProductSavedHook[]> {
  const fns = moduleExtensionPointComponents[POINT] ?? {}
  if (Object.keys(fns).length === 0) return []
  const modules = await getInstalledManifests()
  const hooks: ProductSavedHook[] = []
  for (const mod of modules) {
    const manifest = mod.manifest as { extensionPoints?: ExtensionPointEntry[] } | null
    if (!manifest?.extensionPoints) continue
    for (const entry of manifest.extensionPoints) {
      if (entry.point !== POINT) continue
      const fn = fns[entry.id] as ProductSavedHook | undefined
      if (fn) hooks.push(fn)
    }
  }
  return hooks
}

/** Tell every listener a product was written. Never rejects. */
export async function notifyProductSaved(productId: string, changed: readonly string[]): Promise<void> {
  if (changed.length === 0) return
  let hooks: ProductSavedHook[]
  try {
    hooks = await getProductSavedHooks()
  } catch (err) {
    console.error('[shop] could not read product-saved hooks', err)
    return
  }
  for (const hook of hooks) {
    try {
      await hook(productId, changed)
    } catch (err) {
      console.error('[shop] product-saved hook failed', err)
    }
  }
}
