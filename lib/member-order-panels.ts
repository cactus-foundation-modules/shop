// Server-side resolver for the `shop.member-order-panels` extension point. A
// companion module may contribute a whole card to a customer's own order page -
// somewhere to review what they bought, say - which then sits with the rest of
// the order rather than in an email they have to go and find.
//
// Shop learns nothing about what a panel holds: it supplies the card, the
// heading and the styling, and the provider fills it. Same bargain as
// `shop.product-detail-tabs`, and deliberately the same shape, so a module that
// has written one has written both.
//
// Additive: nothing here replaces a card of shop's, so several modules
// contributing at once simply means several more cards and every provider is
// resolved rather than only the first.
//
// The public cousin of the admin screen's `shop.order-detail-panels`, and not
// the same point: that one hands a member of staff an order to act on, this one
// hands the customer their own. A contributor to one is almost never the right
// contributor to the other, and sharing the point would have meant every panel
// checking which side of the shop it had landed on.
import type { ComponentType } from 'react'
import { getInstalledManifests } from '@/lib/modules/live-status'
import type { ShpOrderStatus, ShpPaymentStatus } from '@/modules/shop/lib/types'

// Everything a provider is told about the order and the person reading it,
// resolved once by the page and handed to every provider.
//
// Enough to decide whether there is anything to say without the provider going
// back to shop's tables for the order it has just been handed - the whole point
// of a seam is that the other module does not have to know how shp_orders is
// shaped.
export type ShopMemberOrderContext = {
  orderId: string
  orderNumber: string
  status: ShpOrderStatus
  paymentStatus: ShpPaymentStatus
  /** The address the order was placed with. */
  customerEmail: string
  /** The name the order was placed in. */
  customerName: string
  /**
   * Who is reading, and under what address anything they write should be filed.
   *
   * A member signed in as the owner is their account's address; a guest who has
   * proved the delivery postcode is the order's own. The two are usually the
   * same, and where they are not the account's is the one the rest of the site
   * knows the person by. See lib/order-viewer.ts for how the page decides that
   * somebody may be here at all.
   */
  viewerEmail: string
  viewerName: string
  /** True only for a signed-in member; false for a guest on their own order. */
  signedIn: boolean
  /**
   * The products on the order, deduplicated, in the order the lines run. Lines
   * with no product behind them - a deleted product, a hand-written line - are
   * left out, since there is nothing for a provider to say about them.
   *
   * These are the ids exactly as the order recorded them: on a shop with options
   * that is the catalogue-hidden child row backing the chosen variant, not the
   * page it was bought from. A provider that cares resolves them through
   * `shop.product-page-resolver`.
   */
  productIds: string[]
}

// The shape a module registers at this point.
//
// `Panel` is rendered by the page inside shop's own card, so it may be a client
// component (the usual case - a panel with nothing interactive in it has little
// reason to exist here) and is handed nothing but its own payload. `load` runs
// server-side only and is never passed anywhere.
export type ShopMemberOrderPanelProvider = {
  /**
   * The card's heading.
   *
   * Declared in code rather than in the manifest for the same reason a detail
   * tab's label is: the manifest's `label` is stripped by the install-time
   * schema and only restored on the next deploy, so a manifest-labelled card
   * would spend its first week named after its own id.
   */
  title: string
  /** Optional dynamic heading: called with whatever `load` returned, and its
   *  answer replaces `title` when it is a non-empty string. */
  titleFor?: (payload: unknown) => string | null | undefined
  /** Where the card sits among other contributed ones. Lower runs first;
   *  a provider that says nothing lands after the lot. */
  order?: number
  /**
   * Which side of the receipt the card sits on. `after` - the default - puts it
   * straight under "What you ordered"; `before` puts it above.
   *
   * A panel that asks the customer to do something is worth meeting before a
   * receipt they have already read, whereas one that only reports on the order
   * reads better once they know what the order was.
   */
  placement?: ShopMemberOrderPanelPlacement
  /**
   * Everything this provider holds for this order, resolved while the page
   * renders so a contributed card is in the first HTML rather than in a fetch
   * behind it.
   *
   * Return null for "nothing to say about this order" and no card appears at
   * all, which is the common case - it costs no markup. The return value
   * crosses to the browser, so it must be JSON-serialisable.
   */
  load: (context: ShopMemberOrderContext) => Promise<unknown>
  Panel: ComponentType<ShopMemberOrderPanelProps>
}

// What the page hands the provider's panel. Rendered inside shop's own
// `.sod-card`, so a contributed panel is dressed by the page it sits in rather
// than by the module that supplied it.
export type ShopMemberOrderPanelProps = {
  // Whatever the provider's `load` returned, passed back untouched. Shop treats
  // it as opaque, which is the only thing it asks of it besides being
  // JSON-serialisable.
  payload: unknown
}

// One resolved provider plus its payload, ready for the page to render.
export type ShopMemberOrderPanel = {
  id: string
  title: string
  order: number
  placement: ShopMemberOrderPanelPlacement
  payload: unknown
  Panel: ComponentType<ShopMemberOrderPanelProps>
}

/** Above the receipt card, or below it. */
export type ShopMemberOrderPanelPlacement = 'before' | 'after'

type ExtensionPointEntry = { point: string; id: string }

const POINT = 'shop.member-order-panels'

const DEFAULT_ORDER = 50

const DEFAULT_PLACEMENT: ShopMemberOrderPanelPlacement = 'after'

/**
 * Resolved once per order page. Returns [] on a shop-only site and for any order
 * no provider has anything for, where the page renders exactly as before.
 *
 * A provider whose `load` throws is dropped rather than taking the order page
 * down with it: an extra card is a bonus, and a customer who can still see their
 * parcel and their invoice beats a 500. The failure is logged so it is not
 * silent.
 */
export async function resolveShopMemberOrderPanels(
  context: ShopMemberOrderContext,
): Promise<ShopMemberOrderPanel[]> {
  // Dynamic on purpose, exactly as in lib/detail-tabs.ts: a static edge from a
  // shop lib to the generated registry closes an import cycle, because the
  // registry imports contributed components that reach back into shop's libs.
  // Turbopack can fail a production build on that with "Cannot access 'x'
  // before initialization" while every local check stays green. See
  // scripts/check-import-cycles.mjs.
  const { modulePublicExtensionPointComponents: moduleExtensionPointComponents } =
    await import('@/lib/modules/extension-points.public')
  const providers = moduleExtensionPointComponents[POINT] ?? {}
  if (Object.keys(providers).length === 0) return []

  const modules = await getInstalledManifests()

  const resolved: ShopMemberOrderPanel[] = []
  for (const mod of modules) {
    const manifest = mod.manifest as { extensionPoints?: ExtensionPointEntry[] } | null
    if (!manifest?.extensionPoints) continue
    for (const entry of manifest.extensionPoints) {
      if (entry.point !== POINT) continue
      const provider = providers[entry.id] as ShopMemberOrderPanelProvider | undefined
      if (!provider) continue
      try {
        const payload = await provider.load(context)
        if (payload == null) continue
        // A dynamic heading that misbehaves must not cost the card: fall back to
        // the static title on any thrown error or empty answer.
        let title = provider.title
        if (provider.titleFor) {
          try {
            const dynamic = provider.titleFor(payload)
            if (typeof dynamic === 'string' && dynamic.trim()) title = dynamic.trim()
          } catch {
            // keep the static title
          }
        }
        resolved.push({
          id: entry.id,
          title,
          order: provider.order ?? DEFAULT_ORDER,
          placement: provider.placement ?? DEFAULT_PLACEMENT,
          payload,
          Panel: provider.Panel,
        })
      } catch (error) {
        console.error(`[shop] member-order-panels provider "${entry.id}" failed to load for order ${context.orderId}:`, error)
      }
    }
  }
  return resolved.sort((a, b) => a.order - b.order)
}
