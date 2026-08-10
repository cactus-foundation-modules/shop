import { cssValue } from '@/lib/design/tokens'
import type { CardBadge } from '@/modules/shop/components/puck/parts/part-context'
import type { ShpTagBadge } from '@/modules/shop/lib/types'

// Turning tag rows into the badges a surface prints. Shared by the product card
// (which shows at most one, so it takes the first) and the product page (which
// shows the lot), so the two can never disagree about which tag earns a badge or
// what colour it comes out.
//
// Colours go through cssValue() here rather than at each call site: they are
// owner-typed strings out of the database heading for an inline style, and that
// helper is where the site already strips url()/expression() out of exactly this
// kind of value.
function toBadge(tag: ShpTagBadge): CardBadge {
  return {
    label: (tag.badgeLabel || '').trim() || tag.name,
    variant: 'tag',
    slug: tag.slug,
    colours: {
      bg: cssValue(tag.badgeBg ?? undefined) || undefined,
      bgDark: cssValue(tag.badgeBgDark ?? undefined) || undefined,
      text: cssValue(tag.badgeText ?? undefined) || undefined,
      textDark: cssValue(tag.badgeTextDark ?? undefined) || undefined,
    },
  }
}

/**
 * Every owner-defined badge this product has earned, in the order the admin's
 * Tags list is dragged into (lowest position first, name breaking a tie so the
 * result is stable rather than row-order luck).
 *
 * @param productTags the tag rows actually ticked on the product
 * @param allTags     every tag the surface loaded, needed for the automatic ones
 *                    ("On Sale"), which are never ticked on anything
 * @param reduced     whether this product has money off right now - its own sale
 *                    price, or a companion module reporting a reduced variation
 */
export function resolveTagBadges(productTags: ShpTagBadge[], allTags: ShpTagBadge[], reduced: boolean): CardBadge[] {
  const earned = new Map<string, ShpTagBadge>()
  for (const tag of productTags) {
    if (tag.badgeEnabled && tag.storefrontVisible && !tag.autoRule) earned.set(tag.slug, tag)
  }
  if (reduced) {
    for (const tag of allTags) {
      if (tag.autoRule === 'sale' && tag.badgeEnabled && tag.storefrontVisible) earned.set(tag.slug, tag)
    }
  }
  return [...earned.values()]
    .sort((a, b) => (a.position - b.position) || a.name.localeCompare(b.name))
    .map(toBadge)
}
