import { Render } from '@puckeditor/core/rsc'
import type { Data } from '@puckeditor/core'
import { prisma } from '@/lib/db/prisma'
import { resolveThemeLayout } from '@/lib/layout/resolveThemeLayout'
import type { LayoutRef } from '@/lib/puck/LayoutPickerField'
import type { PuckData, ShpProduct, ShpProductMedia, ShpTag, ShpTagBadge } from '@/modules/shop/lib/types'
import { injectShopProductCardEmbed } from '@/modules/shop/lib/inject-part-context'
import { formatMoney } from '@/modules/shop/lib/money'
import { isOnSale, priceView } from '@/modules/shop/lib/pricing'
import { resolveTagBadges } from '@/modules/shop/lib/tag-badges'
import { makeDisplayAdjuster, NO_TAX_DISPLAY, type TaxDisplay } from '@/modules/shop/lib/tax-display'
import { SHOP_DEFAULT_COMMERCE_MODE, type ResolvedShopCommerceMode } from '@/modules/shop/lib/commerce-mode-shared'
import type { CardPartContext, CardBadge, PartImage } from '@/modules/shop/components/puck/parts/part-context'
import type { ShopCardExtra } from '@/modules/shop/lib/card-media'
import type { ShopCardFromPrice } from '@/modules/shop/lib/card-price'

// Server-only helper shared by every product-card surface (grid, related,
// featured, single). It resolves the one Product Card template - a per-block
// override if the surface was given one, else the published `shopProductCard`
// default - and stamps it once per product with injected context. There is no
// hardcoded design fallback: the published Default starter is the source of
// truth (see SPEC_shop_block_layouts.md). The tiny MinimalCard below is only a
// safety net for the pathological case where an owner has unpublished every
// card layout, so the storefront never renders a blank grid.
//
// config.rsc is imported dynamically (as LayoutEmbedRsc does) to avoid an import
// cycle: config.rsc -> module-rsc-components -> these surfaces -> this file.

export async function resolveCardTemplate(layoutRef?: LayoutRef | null): Promise<PuckData | null> {
  let layout = null
  if (layoutRef?.id) {
    layout = await prisma.layout.findUnique({ where: { id: layoutRef.id } }).catch(() => null)
  }
  if (!layout?.builderData) {
    layout = await resolveThemeLayout('shopProductCard', { moduleName: 'shop' })
  }
  if (!layout?.builderData) return null
  return layout.builderData as PuckData
}

function isOutOfStock(product: ShpProduct): boolean {
  return (
    !!product.trackInventory &&
    (product.stockCount ?? 0) <= 0 &&
    product.outOfStockBehaviour === 'BLOCK' &&
    !product.isPreOrder
  )
}

// Every card surface needs the same two lookups off the one listTags() call it
// already makes: id -> slug, which is what the historical 'new'/'trade' badges
// and the card context read, and id -> the whole row, which is what an owner's
// own tag badge needs. Built together here so a surface cannot pass one and
// forget the other.
export function buildTagMaps(tags: ShpTag[]): { tagById: Map<string, string>; tagsById: Map<string, ShpTagBadge> } {
  return {
    tagById: new Map(tags.map((t) => [t.id, t.slug])),
    tagsById: new Map(tags.map((t) => [t.id, t])),
  }
}

// Every badge a card has earned, in the order they are printed. Stock and
// pre-order facts lead, ahead of anything an owner labelled a product with - a
// shopper needs "Out of stock" before "Bestseller" - then the owner's own
// badges, then the historical built-in ones.
//
// `owned` is the owner-defined badges this product earned, highest first (see
// lib/tag-badges.ts, shared with the product page). Empty where a surface has
// not passed its tag rows - a companion module's grid built before this existed -
// and the two historical hardcoded slugs below then carry on exactly as they
// always did. A tag whose slug is 'new' or 'trade' and which carries its own
// badge would otherwise print twice, once in the owner's colours and once in the
// built-in ones, so the hardcoded pair stand down where that has happened - the
// same rule the product page applies (ShopDetailBadgesRsc).
function badgesFor(product: ShpProduct, tagSlugs: string[], outOfStock: boolean, owned: CardBadge[]): CardBadge[] {
  const badges: CardBadge[] = []
  if (outOfStock) badges.push({ label: 'Out of stock', variant: 'muted' })
  else if (product.isPreOrder) badges.push({ label: 'Pre-order', variant: 'new' })
  badges.push(...owned)
  const ownedSlugs = new Set(owned.map((b) => b.slug))
  if (!ownedSlugs.has('new') && tagSlugs.includes('new')) badges.push({ label: 'New', variant: 'new' })
  const lowStock =
    !!product.trackInventory &&
    product.stockCount != null &&
    product.stockCount > 0 &&
    product.lowStockThreshold != null &&
    product.stockCount <= product.lowStockThreshold
  if (lowStock) badges.push({ label: 'Low stock', variant: 'low' })
  if (!ownedSlugs.has('trade') && tagSlugs.includes('trade')) badges.push({ label: 'Trade price', variant: 'trade' })
  return badges
}

// Builds the per-product context from data the surface already loaded - no
// re-query happens here (spec wrinkle 1: pass data down, don't re-fetch).
export function buildCardContext(
  product: ShpProduct,
  media: ShpProductMedia[],
  tagById: Map<string, string>,
  tagIds: string[],
  currencySymbol: string,
  // Which optional price types the shop has switched on, and whether an RRP is
  // shown to shoppers. Optional so a card surface in another module that has not
  // been rebuilt still compiles; without it a sale price set on a product shows
  // even if the shop has since switched sale prices off.
  // `taxDisplay` is how the shop prints prices as against how it stores them,
  // resolved once for the whole grid (lib/tax-display.ts) and applied here to
  // the product's own figures AND to a companion module's "from" price, so a
  // card can never show one of them net beside the other gross.
  // `commerce` is how the shop is transacted with (lib/commerce-mode.ts),
  // resolved once for the whole grid like taxDisplay. Optional for the same
  // reason: a card surface in another module that has not been rebuilt still
  // compiles, and falls back to shop's own basket behaviour.
  pricing?: { enabledPriceTypes?: readonly string[]; showRetailPrice?: boolean; taxDisplay?: TaxDisplay; commerce?: ResolvedShopCommerceMode },
  // The figure when a companion module prices this product itself
  // (shop-variations), resolved once for the whole grid via resolveCardFromPrices
  // and passed in per product. Null/absent leaves the card on shop's own price.
  fromPrice?: ShopCardFromPrice | null,
  // Images + overlays contributed by companion modules through `shop.card-media`,
  // resolved once for the whole grid via resolveShopCardExtras and passed in per
  // product. Absent on a shop-only site and for any product no module added to.
  extra?: ShopCardExtra,
  // The full tag rows behind `tagById`, keyed the same way, so a tag that has
  // switched its own badge on can be printed with its own label and colours.
  // Optional deliberately: filters-for-shop and product-attributes-for-shop both
  // call this, and a copy of either built before tag badges existed keeps
  // compiling and keeps rendering exactly the badges it always did.
  tagsById?: Map<string, ShpTagBadge>,
): CardPartContext {
  // The product's own pictures, primary first then the rest in position order,
  // videos-by-URL excluded (they cannot sit in an <img>) - the same filter the
  // detail gallery uses. Variation photos, if any, follow after.
  const usable = media.filter((m) => m.type !== 'VIDEO_URL')
  const primary = usable.find((m) => m.isPrimary) ?? usable[0]
  const ordered = primary ? [primary, ...usable.filter((m) => m !== primary)] : usable
  const ownImages: PartImage[] = ordered.map((m) => ({ url: m.url, alt: m.altText ?? product.name }))
  // Own images first, then any a companion module folded in, deduped by url so a
  // variation whose photo is also the parent's primary does not appear twice.
  // Ahead of both sit any a module asked to LEAD with (`leadImages`), which is how
  // a product whose own shots are line drawings can put a variation's photograph
  // on the grid - the product's own pictures still follow, nothing is dropped.
  const images: PartImage[] = []
  const seenUrls = new Set<string>()
  for (const im of [...(extra?.leadImages ?? []), ...ownImages, ...(extra?.images ?? [])]) {
    if (seenUrls.has(im.url)) continue
    seenUrls.add(im.url)
    images.push(im)
  }
  // A contributed image carries no alt of its own where the media row had none -
  // fine for a supplementary picture behind the arrows, not fine for the one the
  // card leads with, which is all a screen reader meets before the name. Only the
  // first, and only when it is blank.
  if (images[0] && !images[0].alt) images[0] = { ...images[0], alt: product.name }
  const tagSlugs = tagIds.map((id) => tagById.get(id)).filter((s): s is string => Boolean(s))
  const productTags = tagsById
    ? tagIds.map((id) => tagsById.get(id)).filter((t): t is ShpTagBadge => Boolean(t))
    : []
  // Automatic tags are never in tagIds - there is nothing in shp_product_tags to
  // put them there. A product is in the "On Sale" one while its own price is
  // reduced, or while a companion module says one of its variations is (a
  // variations listing's own price columns are not the ones that get discounted).
  const reduced = isOnSale(product, pricing?.enabledPriceTypes) || fromPrice?.onSale === true
  const allTags = tagsById ? [...tagsById.values()] : []
  if (reduced) {
    for (const tag of allTags) {
      if (tag.autoRule === 'sale' && !tagSlugs.includes(tag.slug)) tagSlugs.push(tag.slug)
    }
  }
  const ownedBadges = resolveTagBadges(productTags, allTags, reduced)
  const badges = badgesFor(product, tagSlugs, isOutOfStock(product), ownedBadges)
  const taxDisplay = pricing?.taxDisplay ?? NO_TAX_DISPLAY
  const adjust = makeDisplayAdjuster(taxDisplay, product.taxClassId)
  return {
    product,
    image: images[0] ?? null,
    images,
    overlays: extra?.overlays ?? [],
    facts: extra?.facts ?? [],
    currencySymbol,
    commerce: pricing?.commerce ?? SHOP_DEFAULT_COMMERCE_MODE,
    prices: priceView(product, pricing?.enabledPriceTypes, adjust),
    priceSuffix: taxDisplay.display.suffix,
    showRetailPrice: pricing?.showRetailPrice ?? false,
    badges,
    // The first of them, kept so a card surface built before the card printed
    // more than one still compiles and still shows the top badge.
    badge: badges[0] ?? null,
    fromPrice: fromPrice ? (adjust ? adjust(Number(fromPrice.price)).toFixed(2) : fromPrice.price) : null,
    fromPriceVaries: fromPrice?.varies ?? false,
  }
}

export type CardItem = { product: ShpProduct; ctx: CardPartContext }

// Stamps the template for each product and returns the card anchors. The
// surface supplies the `.shop-grid` wrapper and emits shopCardCss once.
// Returns the cards as an ARRAY rather than a bare ReactNode. It always did -
// the body is one items.map - but the looser type meant a caller wanting to
// slice the list (the pager) could not, and every caller that just drops it into
// JSX is unaffected either way.
export async function renderCards(template: PuckData, items: CardItem[]): Promise<React.ReactNode[]> {
  const { getModuleLayoutPuckRscConfig } = await import('@/lib/puck/config.rsc')
  const config = getModuleLayoutPuckRscConfig('shopProductCard')
  // Every block registered for this layout type, shop's own parts and any a
  // companion module contributed. They all get the card context injected, so a
  // module's card part renders real data rather than its editor skeleton.
  const partTypes = config.categories.blocks.components
  return items.map(({ product, ctx }) => {
    const data = injectShopProductCardEmbed(template, ctx, partTypes)
    return (
      <div key={product.id} className="shop-card">
        {/* Stretched link: the whole card still navigates, but the anchor is a
            sibling under the parts rather than wrapping them. That is what lets the
            image carousel's arrows and the 3D icon inside the card be real, focusable
            buttons instead of interactive content illegally nested in an <a>. The
            link sits above the picture and text (z-index) but below those controls -
            see shopCardCss. */}
        <a className="shop-card-link" href={`/shop/products/${product.slug}`} aria-label={product.name} />
        <Render config={config as any} data={data as Data} />
      </div>
    )
  })
}

// Safety-net card used only when no Product Card layout is published at all.
export function MinimalCard({ product, ctx }: CardItem) {
  return (
    <a href={`/shop/products/${product.slug}`} className="shop-card">
      <div className="shop-card-img">
        {ctx.image && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={ctx.image.url} alt={ctx.image.alt} />
        )}
      </div>
      <h3 className="shop-card-name">{product.name}</h3>
      <div className="shop-card-pricerow">
        {/* A shop quoting by hand shows its stand-in wording once, not a "POA"
            in place of each of the three figures a priced card would carry. */}
        {ctx.commerce.hidePrices ? (
          <span className="shop-card-price">{ctx.commerce.hiddenPriceLabel}</span>
        ) : ctx.fromPrice != null ? (
          <span className="shop-card-price">{ctx.fromPriceVaries ? 'From ' : ''}{formatMoney(ctx.fromPrice, ctx.currencySymbol)}</span>
        ) : (
          <>
            <span className="shop-card-price">{formatMoney(ctx.prices.now, ctx.currencySymbol)}</span>
            {ctx.prices.was && <span className="shop-card-compare">{formatMoney(ctx.prices.was, ctx.currencySymbol)}</span>}
          </>
        )}
        {!ctx.commerce.hidePrices && ctx.priceSuffix && <span className="shop-card-taxnote">{ctx.priceSuffix}</span>}
      </div>
    </a>
  )
}
