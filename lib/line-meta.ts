// Server-side carrier for per-line personalisation (spec §4.3). Shop stays
// generic: it knows nothing about what a "line meta" contains, only that a
// companion module can register a `shop.cart-line-resolver` provider which
// validates and prices the shopper's raw inputs for a given product.
//
// Precedent: contact-form.thread-messages -> getCaughtReplyThreadMessages. Like
// that one, the provider is a plain server function stored in the generated
// moduleExtensionPointComponents map, discovered via the active modules'
// manifests. It MUST be server-safe (this file runs inside lib/checkout.ts).
import { prisma } from '@/lib/db/prisma'
import { INSTALLED_MODULE_WHERE } from '@/lib/modules/live-status'
import { moduleExtensionPointComponents } from '@/lib/modules/extension-points'
import type { LineMeta, ShpProduct } from '@/modules/shop/lib/types'

// A declarative per-line picker a resolver can offer for display in the cart.
// Shop renders it generically - a labelled <select> by default, a radio group
// when `renderAs` is 'radios', or the chosen option as a confirmed bar with the
// rest as switch chips when it is 'summary' - and, on change, writes the chosen value back into
// the line's meta under `key` and re-validates, so the contributing module never
// ships a component into shop's cart, only data. The options carry their own
// already-formatted labels (e.g. a price suffix). `renderAs` is optional: an
// older shop that does not read it simply renders the dropdown regardless.
// An option may carry its numeric price adjustment (the same figure already
// baked into its label). The cart uses it to move the line price optimistically
// the moment the shopper picks an option, then reconciles with the server's
// re-validate. Optional: a resolver that omits it still works - the price just
// waits for the round-trip as before.
// One option's own wording, pre-split by the resolver for the cart's summary
// presentation: the chosen option is shown as a confirmed bar (`headline`, with
// `secondary` as a muted qualifier and `priceLabel` pushed to the right), and
// every other option becomes a one-click chip reading `switchLabel` + its price.
// Shop only ever displays these strings - it never parses or re-words them.
export type CartLineControlSummary = {
  headline: string
  secondary?: string
  switchLabel?: string
  priceLabel?: string
}

export type CartLineControl = {
  key: string
  label: string
  value: string
  // An option may carry a short `description` - supporting copy the resolver
  // wants shown with the option (what a delivery service includes, say). The
  // cart renders it as muted text under the option (radios) or under the picker
  // for the chosen option (select). Optional: an older shop, or a resolver that
  // omits it, renders exactly as before.
  // An option may also carry a `summary`: the same option broken into the parts
  // the cart's summary presentation lays out (the outcome as a headline, a short
  // qualifier, the price on its own, and a compact wording for the switch chip).
  // Only a resolver that supplies it for EVERY option gets that presentation -
  // shop never splits a label itself, so it can never guess wrong.
  options: {
    value: string
    label: string
    priceAdjust?: number
    description?: string
    summary?: CartLineControlSummary
  }[]
  renderAs?: 'select' | 'radios' | 'summary'
  // Opt-in: the options' own labels already state their outcome in full (e.g. a
  // delivery tier whose label carries its promised date), so the cart renders
  // the picker bare - it drops the group's "<label>:" heading and skips the one
  // restated confirmation field (the persisted meta field whose label matches
  // this control's), which would only repeat what every option already says.
  // Absent/false keeps the generic look: a visible heading plus that field
  // shown beside the picker. A shop too old to read it just renders the generic
  // look regardless, so a module can set it safely.
  optionsSelfLabelled?: boolean
}

// How a line is titled in the cart. A resolver may hand back a base `name` (shown
// as the linked product title, on its own line) and an optional `secondary` line
// beneath it - a variant's chosen options, say, lifted out of the product's own
// decorated name so the name and the choices no longer share one line. Shop
// applies it generically: it knows only that some resolver retitled the line,
// never which module or why. Absent -> the product's own name is shown unchanged.
export type CartLineTitle = {
  name: string
  secondary?: string
}

// What a provider returns for one line. priceAdjust is added to the product's
// own price (server-authoritative - the client never sends a price). An invalid
// line fails exactly like an out-of-stock line, carrying a human reason. An
// optional `control` offers a per-line picker the cart renders generically.
// A named slice of this line's `priceAdjust` that is a separate CHARGE rather
// than part of what the product itself costs - a delivery service, say. The
// amount is per unit, exactly like priceAdjust, and is already counted inside
// it: this only says how much of the adjustment to attribute elsewhere, it
// never adds money. The cart uses it to show "Subtotal / Delivery / Total"
// instead of quietly folding a service fee into the goods figure. Shop only
// ever sums by `label` and prints it - it never interprets what the charge is.
export type CartLineCharge = { label: string; amount: number }

export type CartLineResolution = {
  valid: boolean
  priceAdjust: number
  persistMeta: LineMeta | null
  reason?: string
  control?: CartLineControl | null
  // Optional cart-display retitle (e.g. split a variant name into base + options).
  displayTitle?: CartLineTitle | null
  // Optional attribution of part of priceAdjust to a named charge (see above).
  charges?: CartLineCharge[] | null
}

export type CartLineResolver = (
  product: ShpProduct,
  meta: Record<string, unknown> | undefined,
) => Promise<CartLineResolution> | CartLineResolution

// Optional companion to a cart-line resolver: given every product in the cart at
// once, a module can warm a request-scoped batch cache before shop folds the
// lines. Each resolver otherwise resolves its line in isolation (a delivery
// estimate, an add-on lookup), firing a handful of queries per line; a whole
// cart then multiplies that by the line count. The prefetcher lets the module
// turn that fan into one batched read. It returns nothing - it only primes the
// cache the per-line resolver reads. A resolver that offers no prefetcher, or an
// older shop that never calls one, still works (the resolver falls back to its
// own per-line resolve).
export type CartLineResolverPrefetch = (products: ShpProduct[]) => Promise<void> | void

type ExtensionPointEntry = { point: string; id: string; permission?: string }

const POINT = 'shop.cart-line-resolver'
const PREFETCH_POINT = 'shop.cart-line-resolver-prefetch'

// Installed modules' manifests, shared by both gatherers below and memoised
// across requests for a short window. This used to be a separate
// Module.findMany per gatherer per validate - two identical queries per cart
// interaction for a list that changes only when a module is installed or
// removed. A rejected read clears the slot so the next call retries.
const REGISTRY_TTL_MS = 30_000
let manifestSlot: { promise: Promise<{ manifest: unknown }[]>; at: number } | null = null
function getInstalledManifests(): Promise<{ manifest: unknown }[]> {
  const now = Date.now()
  if (manifestSlot && now - manifestSlot.at < REGISTRY_TTL_MS) return manifestSlot.promise
  const promise = prisma.module.findMany({
    where: { ...INSTALLED_MODULE_WHERE },
    select: { manifest: true },
  })
  const mine = { promise, at: now }
  manifestSlot = mine
  promise.catch(() => { if (manifestSlot === mine) manifestSlot = null })
  return promise
}

// Extension-point functions declared by installed modules' manifests for one
// point, in manifest order. Exported as `gatherCartExtensionPoint` for the other
// cart-fold seams (see lib/cart-summary.ts) so they share this file's memoised
// installed-module read rather than each firing their own Module.findMany.
export async function gatherCartExtensionPoint<T>(point: string): Promise<T[]> {
  return gatherPoint<T>(point)
}

async function gatherPoint<T>(point: string): Promise<T[]> {
  const fns = moduleExtensionPointComponents[point] ?? {}
  if (Object.keys(fns).length === 0) return []
  const modules = await getInstalledManifests()
  const gathered: T[] = []
  for (const mod of modules) {
    const manifest = mod.manifest as { extensionPoints?: ExtensionPointEntry[] } | null
    if (!manifest?.extensionPoints) continue
    for (const entry of manifest.extensionPoints) {
      if (entry.point !== point) continue
      const fn = fns[entry.id] as T | undefined
      if (fn) gathered.push(fn)
    }
  }
  return gathered
}

// Collected once per checkout resolution rather than per line. Returns [] when
// no module contributes (a shop-only site), so every code path below no-ops.
export async function getCartLineResolvers(): Promise<CartLineResolver[]> {
  return gatherPoint<CartLineResolver>(POINT)
}

// The batch prefetchers contributed by installed modules, gathered once per
// resolution (mirrors getCartLineResolvers' installed-module gating). Returns []
// when no module offers one, so the caller simply skips the prefetch phase.
export async function getCartLineResolverPrefetchers(): Promise<CartLineResolverPrefetch[]> {
  return gatherPoint<CartLineResolverPrefetch>(PREFETCH_POINT)
}

// Runs every provider for one line and folds the results: prices sum, fields
// concatenate, and any single invalid result fails the whole line. A line with
// no providers (or none that claim it) resolves valid with a zero adjustment.
export async function resolveLineMeta(
  product: ShpProduct,
  meta: Record<string, unknown> | undefined,
  resolvers: CartLineResolver[],
): Promise<CartLineResolution> {
  if (resolvers.length === 0) return { valid: true, priceAdjust: 0, persistMeta: null, control: null, displayTitle: null, charges: null }

  let priceAdjust = 0
  let valid = true
  let reason: string | undefined
  let control: CartLineControl | null = null
  let displayTitle: CartLineTitle | null = null
  const fields = []
  // Every resolver's opaque state shares one bag on the line (see LineMeta.data),
  // so keys are the writing module's to namespace. First writer keeps the key: a
  // later resolver silently overwriting another module's state would be the worst
  // of the two outcomes, and there is nothing here shop could sensibly merge.
  let data: Record<string, unknown> | undefined
  // Charges accumulate across providers exactly as prices do - two modules can
  // each attribute a slice of their own adjustment without knowing about each
  // other, and same-labelled slices simply sum in the cart.
  const charges: CartLineCharge[] = []
  for (const resolve of resolvers) {
    const res = await resolve(product, meta)
    if (!res.valid) {
      valid = false
      reason = reason ?? res.reason
    }
    priceAdjust += Number.isFinite(res.priceAdjust) ? res.priceAdjust : 0
    if (res.persistMeta?.fields?.length) fields.push(...res.persistMeta.fields)
    if (res.persistMeta?.data) {
      data = data ?? {}
      for (const [key, value] of Object.entries(res.persistMeta.data)) {
        if (!(key in data)) data[key] = value
      }
    }
    // First provider to offer a control wins the slot (there is one picker row
    // per line); further ones fold their price and fields but not a second box.
    if (!control && res.control) control = res.control
    // Likewise the first retitle wins - a line has one name.
    if (!displayTitle && res.displayTitle) displayTitle = res.displayTitle
    // A charge only ever names money already counted in priceAdjust, so a
    // negative one would be money invented. Those are dropped rather than
    // trusted; the caller clamps the total against the line price (see
    // resolveCartLines), which is the figure that must not be overdrawn.
    if (res.charges?.length) {
      for (const c of res.charges) if (c.label && Number.isFinite(c.amount) && c.amount > 0) charges.push({ label: c.label, amount: c.amount })
    }
  }
  return {
    valid,
    priceAdjust,
    // Data with no fields is still worth persisting: a resolver may carry state
    // for a later restatement without having anything to print today.
    persistMeta: fields.length || data ? { fields, ...(data ? { data } : {}) } : null,
    reason,
    control,
    displayTitle,
    charges: charges.length ? charges : null,
  }
}
