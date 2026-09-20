import { connection } from 'next/server'
import { Render } from '@puckeditor/core/rsc'
import type { Data } from '@puckeditor/core'
import { prisma } from '@/lib/db/prisma'
import { resolveThemeLayout } from '@/lib/layout/resolveThemeLayout'
import type { LayoutRef } from '@/lib/puck/LayoutPickerField'
import { getProductBySlugCached, getProductMedia, getProductTagIds, getDigitalFileById } from '@/modules/shop/lib/db'
import { listTags } from '@/modules/shop/lib/db/catalogue'
import { getShopConfigCached, resolveSupplierLabel } from '@/modules/shop/lib/config'
import { getShopBreakpoints } from '@/modules/shop/lib/breakpoints'
import { isOnSale, priceView } from '@/modules/shop/lib/pricing'
import { resolveTagBadges } from '@/modules/shop/lib/tag-badges'
import { resolveCardFromPrices } from '@/modules/shop/lib/card-price'
import { makeDisplayAdjuster, makeGrossAdjuster, productTaxView, resolveTaxDisplay } from '@/modules/shop/lib/tax-display'
import { injectShopProductDetailEmbed } from '@/modules/shop/lib/inject-part-context'
import { resolveShopDetailProvider, narrowShopDetailSlot, coveredByLayoutBlocks, collectLayoutBlockTypes } from '@/modules/shop/lib/detail-slot'
import { resolveShopDetailTabs } from '@/modules/shop/lib/detail-tabs'
import { resolveShopDetailSpec } from '@/modules/shop/lib/detail-spec'
import { getProductFaqCategoryChain } from '@/modules/shop/lib/db/catalogue'
import { normaliseFaqItems, resolveProductFaqs } from '@/modules/shop/lib/faq'
import { renderFaqItems } from '@/modules/shop/lib/faq-render'
import { resolveShopGalleryExtras } from '@/modules/shop/lib/gallery-media'
import { stripHtmlToPlainText } from '@/modules/shop/lib/strip-html'
import { resolveShopCommerceMode } from '@/modules/shop/lib/commerce-mode'
import { resolveProductAdminEditHref } from '@/modules/shop/lib/admin-edit'
import { canSeeStockLevels } from '@/modules/shop/lib/admin-stock'
import { canSeeProductCodes } from '@/modules/shop/lib/admin-codes'
import { canSeeReturnsPolicy } from '@/modules/shop/lib/admin-returns'
import { getSupplierByName } from '@/modules/shop/lib/db/suppliers'
import { buildProductJsonLd, type ShopShippingOption } from '@/modules/shop/lib/product-jsonld'
import { resolveMerchantFacts } from '@/modules/shop/lib/merchant-facts'
import { resolveSelectedVariation } from '@/modules/shop/lib/product-selected-variation'
import { resolveProductDeliveryOptions } from '@/modules/shop/lib/detail-delivery'
import { resolveProductRating } from '@/modules/shop/lib/detail-rating'
import { productUrl } from '@/modules/shop/lib/product-url'
import { nonReturnableNote, returnsPolicy } from '@/modules/shop/lib/returnable'
import { getSiteUrl } from '@/lib/config/env'
import { supplierHref } from '@/modules/shop/lib/supplier-url'
import { orderSizeDeductionView } from '@/modules/shop/lib/order-size-deduction-view'
import type { PuckData } from '@/modules/shop/lib/types'
import type { DetailPartContext } from '@/modules/shop/components/puck/parts/part-context'
import { shopProductDetailPuckComponent, type ShopProductDetailProps } from './ShopProductDetail'
import { getPuckRenderMetadata } from '@/lib/puck/renderMetadata'

// Server (RSC) half of the ShopProductDetail block. Kept in its own file so the
// server-only imports below - prisma, next/server, and the dynamic import of
// lib/puck/config.rsc (which itself depends on next/headers via other modules'
// RSC blocks) - are never statically reachable from the client Puck editor
// bundle. The editor placeholder and Puck field config live in
// ShopProductDetail.tsx; the manifest points `rscImport` here.

async function resolveDetailTemplate(layoutRef: LayoutRef | null | undefined, slug: string): Promise<PuckData | null> {
  let layout = null
  if (layoutRef?.id) {
    layout = await prisma.layout.findUnique({ where: { id: layoutRef.id } }).catch(() => null)
  }
  if (!layout?.builderData) {
    layout = await resolveThemeLayout('shopProductDetail', { moduleName: 'shop', slug })
  }
  return layout?.builderData ? (layout.builderData as PuckData) : null
}

export async function ShopProductDetailRsc(props: ShopProductDetailProps) {
  await connection()
  if (!props.productSlug) return null
  const product = await getProductBySlugCached(props.productSlug)
  if (!product) return null

  // The claim needs only the product, so it still resolves alongside the
  // template; which of its slots the layout has already covered is decided
  // below, once the template's blocks are known.
  // Extra gallery media and contributed tabs are additive and need only the
  // product, so they resolve alongside everything else rather than behind the
  // template.
  const [media, config, taxDisplay, bp, tags, tagIds, template, provider, galleryExtras, detailTabs, specOverride, adminEditHref, showAdminStock, showAdminCodes, showAdminReturns, merchantFacts, deliveryOptions, rating, selectedVariation] = await Promise.all([
    getProductMedia(product.id),
    getShopConfigCached(),
    resolveTaxDisplay(),
    getShopBreakpoints(),
    listTags(),
    getProductTagIds(product.id),
    resolveDetailTemplate(props.layoutRef, props.productSlug),
    resolveShopDetailProvider(product),
    resolveShopGalleryExtras(product.id),
    resolveShopDetailTabs(product.id),
    resolveShopDetailSpec(product.id),
    // Whoever is looking gets their own answer, so this cannot be cached
    // alongside the product: a shopper must never receive an admin's link.
    resolveProductAdminEditHref(product.id),
    // Same again for the stock figure: per-viewer, never cached with the product.
    canSeeStockLevels(),
    // And for the buying codes, which are staff-only for the same reason.
    canSeeProductCodes(),
    // And for what the returns policy says about this one.
    canSeeReturnsPolicy(),
    // The three seams the Product structured data below reads. All optional -
    // each returns nothing on a shop without the companion module that fills it -
    // and all resolved here rather than beside the markup so a page render costs
    // one round of queries rather than three sequential ones.
    resolveMerchantFacts([product.id]),
    resolveProductDeliveryOptions(product.id),
    resolveProductRating(product.id),
    // And the fourth: which single combination, if any, the option parameters on
    // this URL name. Independent of everything above, so it rides along rather
    // than costing the page a round trip of its own.
    resolveSelectedVariation(product),
  ])
  // The site-wide values every Puck block reads off `puck.metadata` - whether
  // pictures load lazily, which webfonts the page already has, and whether a
  // picture may be asked for at the size it is drawn.
  //
  // This layout has its own <Render>, and a Render with no `metadata` hands every
  // block inside it NOTHING - so none of those three ever reached a block on a
  // product page. It is not a new omission; it is why the responsive-images switch
  // appeared to do nothing here while working on the homepage, whose blocks come
  // through core's renderInfoPage (which has always passed it). cache()d, so this
  // shares the query the page has already made.
  const puckMetadata = await getPuckRenderMetadata()
  const tagById = new Map(tags.map((t) => [t.id, t.slug]))
  const tagSlugs = tagIds.map((id) => tagById.get(id)).filter((s): s is string => Boolean(s))

  // Owner-defined tag badges, resolved exactly as the card resolves them so the
  // grid and the page it leads to never disagree about what this product is
  // labelled. The automatic "On Sale" one needs to know whether the product is
  // actually reduced: its own sale price answers that for a plain product, and
  // for a listing with variations the money is on the hidden children, so the
  // same seam the cards use is asked about this one product (one small query on
  // a shop with variations, none at all without).
  const variantPricing = (await resolveCardFromPrices([product.id])).get(product.id) ?? null
  const reduced = isOnSale(product, config.enabledPriceTypes) || variantPricing?.onSale === true
  const productTags = tagIds.map((id) => tags.find((t) => t.id === id)).filter((t) => Boolean(t)) as typeof tags
  const tagBadges = resolveTagBadges(productTags, tags, reduced)
  if (reduced) {
    for (const tag of tags) {
      if (tag.autoRule === 'sale' && !tagSlugs.includes(tag.slug)) tagSlugs.push(tag.slug)
    }
  }

  const digitalFile =
    product.type === 'DIGITAL' && product.digitalFileId ? await getDigitalFileById(product.digitalFileId) : null

  // The product's FAQs section: its own questions, its category's (and its
  // category's parents'), and the shop-wide ones, merged nearest-first by
  // lib/faq.ts. The walk up the category tree is the only query this costs, and
  // it is skipped entirely on a shop with the feature off and on any product
  // that has said it inherits nothing - so a shop that never writes a question
  // pays for none of it.
  //
  // Rendered here and not further down because the section itself is drawn by a
  // CLIENT component (the search box), and turning an answer's markup into safe
  // HTML needs the sanitiser, which needs jsdom, which must never cross into the
  // browser bundle. Server side is the only side that can do it.
  const faqs = config.productFaqsEnabled
    ? renderFaqItems(
        resolveProductFaqs({
          product: product.faqs,
          categories: product.faqs.inherit ? await getProductFaqCategoryChain(product.id) : [],
          shopWide: normaliseFaqItems(config.productFaqs),
        }),
      )
    : []

  // The "Ask a question" form that sits under them. Independent of whether this
  // product has any questions yet - a product nobody has written a FAQ for is
  // exactly the one a shopper needs to ask about - but it does ride on the FAQs
  // feature being on at all, since the section it appears in is that feature's.
  const askQuestion =
    config.productFaqsEnabled && config.productQuestionsEnabled
      ? {
          buttonLabel: config.productQuestionsButtonLabel,
          intro: config.productQuestionsIntro,
          thanks: config.productQuestionsThanks,
        }
      : null

  // ONE supplier read, serving both the badge above the title and the order-size
  // deduction line under the price. Skipped entirely unless something on the page
  // could use it: a shop that neither shows the supplier nor runs the deduction
  // fires no query at all, which is every shop until an owner switches one on.
  const wantsSupplier =
    (config.supplierFieldEnabled && config.supplierShowOnFrontend) || config.orderSizeDeductionEnabled
  const supplier = wantsSupplier && product.supplier ? await getSupplierByName(product.supplier) : null

  // The stage draws the original - this is the page where a shopper looks closely
  // and the magnifier zooms in - and the strip of thumbnails beneath it draws the
  // 300px copy, which is what a 64px square actually wants. Both travel; the
  // gallery picks per surface.
  const images = media
    .filter((m) => m.type !== 'VIDEO_URL')
    .map((m) => ({
      url: m.url,
      fullUrl: m.url,
      ...(m.thumbUrl ? { thumbUrl: m.thumbUrl } : {}),
      alt: m.altText ?? product.name,
    }))

  const outOfStock =
    product.trackInventory && (product.stockCount ?? 0) <= 0 && product.outOfStockBehaviour === 'BLOCK' && !product.isPreOrder
  const lowStock =
    !!product.trackInventory &&
    product.stockCount != null &&
    product.stockCount > 0 &&
    product.lowStockThreshold != null &&
    product.stockCount <= product.lowStockThreshold

  // One resolution of the product's price types for the whole page: every part
  // reads it, converted to whichever side of tax the shop PRINTS on
  // (lib/tax-display.ts) here rather than per part, so two parts can never
  // disagree about the figure on screen.
  const displayAdjust = makeDisplayAdjuster(taxDisplay, product.taxClassId)
  const prices = priceView(product, config.enabledPriceTypes, displayAdjust)

  // And a second resolution for the structured data, on the tax-INCLUSIVE side
  // whatever the storefront prints.
  //
  // These two used to be one, on the reasoning that markup should quote the
  // figure on screen. That is right until a shop keeps its prices net - a trade
  // catalogue printing "£126.00 ex. VAT" - and sends a product feed, which for
  // UK shoppers has to quote gross. The channel then compares its row against
  // this markup, finds £126.00 against £151.20, and pulls a perfectly correct
  // item for a price mismatch. The storefront is free to print either side; the
  // markup is not, so it publishes the one a shopper actually pays. On the
  // ordinary shop that stores its prices gross this is a multiply by one and
  // nothing below moves at all.
  const grossAdjust = makeGrossAdjuster(taxDisplay, product.taxClassId)
  const gross = (amount: number) => (grossAdjust ? grossAdjust(amount) : amount)
  const grossPrices = priceView(product, config.enabledPriceTypes, grossAdjust)

  // Money, on the side of tax the markup publishes rather than the side the page
  // prints. Both spellings kept because the figures arrive as both: the card
  // price seam hands back strings, a selected combination hands back numbers.
  const money = (amount: number) => gross(amount).toFixed(2)
  const adjusted = (amount: string) => money(Number(amount))

  // Everything the combination named by this URL identifies itself with: its
  // brand, its barcode and its part number, read back through the same seam and
  // the same rule the listing's own come through, keyed on the child row rather
  // than its parent. One small query, and only on a URL that names a combination
  // outright - which is a feed's landing page and a shared configured link, and
  // is nothing at all on an ordinary browse.
  const selectedFacts = selectedVariation
    ? (await resolveMerchantFacts([selectedVariation.productId])).identifiers.get(selectedVariation.productId) ?? null
    : null

  const offerAvailability = product.isPreOrder
    ? 'https://schema.org/PreOrder'
    : selectedVariation
      // The combination's own answer, where the URL names one. Pre-order stays
      // the listing's to declare: it is set on the row a shopper lands on, and
      // the selector payload carries stock rather than a per-combination
      // pre-order flag, so the honest order is "the listing says pre-order, or
      // else this combination's own shelf".
      ? (selectedVariation.inStock ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock')
      : outOfStock
        ? 'https://schema.org/OutOfStock'
        : 'https://schema.org/InStock'

  // A variations listing has no one price: the shopper picks a combination and
  // the figure moves. Structured data says so with an AggregateOffer quoting the
  // cheapest choice - the same "from" figure the product cards print. A single
  // Offer claiming the parent row's own price would be worse than a range, since
  // that row prices nothing a shopper can actually buy.
  //
  // Unless the URL names a combination outright, and then there is exactly one
  // price, one barcode and one photograph, and a range is the wrong answer: it
  // is the address the sitemap lists, the address the canonical tag agrees with,
  // and the address a product feed sends a shopping channel to carrying that
  // combination's own figures. A crawler arriving with one chair's barcode in
  // hand and finding "somewhere between £48 and £132, no barcode" is the whole
  // reason the item never joins the product it belongs to.
  const fromPrice = !selectedVariation && variantPricing ? adjusted(variantPricing.price) : null

  // Google reads a second, higher price marked `StrikethroughPrice` as the "was"
  // of an offer. Two figures can fill that slot and only one at a time. A genuine
  // sale takes it, because the normal price is what the saving printed on the
  // page is measured against. Failing that an RRP does, but only where the owner
  // has switched it on: an RRP is a figure this shop never charged, so handing it
  // to Google as a strikethrough is a decision rather than a default, and it is
  // doubly gated on the RRP already being printed beside the price (Shop settings
  // > Pricing) so the markup can never claim a saving the shopper cannot see.
  const rrpInSearch = config.showRetailPrice && config.retailPriceInStructuredData

  // The variations branch takes the cheapest choice's RRP - the same pairing the
  // product cards print, "From £x" against the lowest RRP any choice carries -
  // because the parent row's own figures price nothing a shopper can buy. It has
  // no "was": the provider hands back a cheapest price, not a cheapest saving, so
  // a reduced variations listing carries no strikethrough at all rather than the
  // parent's unrelated one.
  //
  // A named combination, by contrast, has both and takes them in the documented
  // order: its own normal price when it is genuinely reduced, else its own RRP
  // where the owner has switched that on and it really is the higher figure.
  const selectedStrikethrough = selectedVariation
    ? selectedVariation.compareAtPrice != null
      ? money(selectedVariation.compareAtPrice)
      : rrpInSearch && selectedVariation.retailPrice != null && selectedVariation.retailPrice > selectedVariation.price
        ? money(selectedVariation.retailPrice)
        : null
    : null
  const strikethrough = selectedVariation
    ? selectedStrikethrough
    : fromPrice
      ? rrpInSearch && variantPricing?.rrp
        ? adjusted(variantPricing.rrp)
        : null
      : (grossPrices.was ?? (rrpInSearch ? grossPrices.rrp : null))

  // The delivery services this product can be bought with, on the same side of
  // tax as every other figure in this markup. The charge rides on the product
  // line and is taxed at the product's own rate, so it converts with the
  // product's own adjuster - anything else would quote a gross price against a
  // net delivery.
  const shippingOptions: ShopShippingOption[] = deliveryOptions.map((option) => ({
    label: option.label,
    description: option.description,
    price: money(option.price),
    handlingDays: option.handlingDays,
    transitDays: option.transitDays,
  }))

  // Only the definite refusal travels. A product the shop will take back is
  // covered by the organisation's own policy, and a "we might" is not a
  // schema.org category at all - guessing one would publish a promise the shop
  // has deliberately not made.
  const returns = returnsPolicy(product.returnable, product.returnsDiscretionary) === 'NONE'
    ? nonReturnableNote(product.nonReturnableNote)
    : null

  // A shop withholding its prices must withhold them here too: structured data
  // is read by shopping tabs and rich results, so leaving the figure in would
  // publish the very number the shop has decided not to quote. Asked before the
  // markup is built rather than deleted out of it afterwards.
  const commerce = await resolveShopCommerceMode()

  // The address this markup is about. The listing's own, unless the URL names a
  // combination - and then the very string the canonical tag carries, because
  // both come from the one function (lib/product-selected-variation.ts). A
  // Product node claiming one address while the canonical claims another is how
  // a page ends up filed as a duplicate of itself.
  const siteUrl = getSiteUrl()
  const listingUrl = productUrl(siteUrl, product.slug, config.productUrlStyle)
  const markupUrl = selectedVariation?.canonicalQuery
    ? `${listingUrl}?${selectedVariation.canonicalQuery}`
    : listingUrl

  // A relative media path is a path this shop can resolve and a scraper cannot,
  // so the pictures leave absolute. A named combination leads with its own,
  // which is what the gallery opens on and what a product feed sent - the
  // listing's follow, deduplicated, because they are still pictures of it.
  const absolute = (url: string) => (url.startsWith('/') ? `${siteUrl}${url}` : url)
  const listingImages = media.map((m) => m.url)
  const markupImages = [
    ...new Set(
      (selectedVariation?.imageUrls.length ? [...selectedVariation.imageUrls, ...listingImages] : listingImages).map(absolute),
    ),
  ]

  const jsonLd = buildProductJsonLd({
    name: product.name,
    description: stripHtmlToPlainText(product.shortDescription ?? product.description ?? '') || undefined,
    images: markupImages,
    url: markupUrl,
    // The listing's own code, and only on the listing. A combination is a
    // different row with a different code, and this payload does not carry it -
    // it is a staff reference and never reaches a shopper's render - so rather
    // than label one chair with its range's code, a named combination publishes
    // no `sku` at all. Its manufacturer part number still travels, in the
    // identifiers below, and that is what a shopping channel matches on.
    sku: selectedVariation ? null : product.sku,
    currency: config.currency,
    availability: offerAvailability,
    ...(selectedVariation
      ? { price: money(selectedVariation.price) }
      : fromPrice
        ? {
            lowPrice: fromPrice,
            highPrice: variantPricing?.highPrice ? adjusted(variantPricing.highPrice) : null,
            offerCount: variantPricing?.offerCount ?? null,
          }
        : { price: grossPrices.now }),
    strikethrough,
    hidePrices: commerce.hidePrices,
    // The combination's own facts where the URL names one, and the listing's
    // otherwise. No falling back from one to the other: a listing's barcode on a
    // combination would claim forty colourways are the same part, which is the
    // claim that gets a whole feed distrusted.
    identifiers: selectedVariation
      ? selectedFacts
      : merchantFacts.identifiers.get(product.id) ?? { gtin: product.barcode },
    shipping: shippingOptions,
    shippingCountry: merchantFacts.shippingCountry,
    rating,
    nonReturnableNote: returns,
  })

  if (!template) return null

  const blockTypes = collectLayoutBlockTypes(template)
  const slot = narrowShopDetailSlot(provider, blockTypes)
  // Which of our parts the layout already prints with a module's own blocks.
  // Asked of an unclaimed provider too: its block sits in the layout regardless
  // of whether it claimed this particular product, so a product with nothing to
  // choose would otherwise get the price printed twice.
  const coveredParts = coveredByLayoutBlocks(provider, blockTypes)

  // config.rsc pulls in next/headers via other modules' RSC blocks, so it stays a
  // dynamic import kept off the client editor bundle. Loaded once here and reused
  // for both the designed-description body and the detail template render below.
  const { getModuleLayoutPuckRscConfig } = await import('@/lib/puck/config.rsc')

  // The product's opt-in designed description. Rendered from its own Puck doc
  // with the same content-only shared parts the editor uses, so editor and
  // storefront markup match. An empty (seeded-but-unused) doc counts as absent,
  // so the Description tab falls back to the plain-text `description`.
  const descriptionBody =
    product.descriptionPuck && Array.isArray(product.descriptionPuck.content) && product.descriptionPuck.content.length > 0
      ? <Render config={getModuleLayoutPuckRscConfig('shopProductDescription') as any} data={product.descriptionPuck as Data} metadata={puckMetadata} />
      : undefined

  // The badge's name comes off the product, not the directory row, so a product
  // filed under a name nobody has added to the address book still shows it. The
  // LINK needs the row, and needs the shop to publish supplier pages at all and
  // this supplier's own page to be published; anything short of that prints the
  // name unlinked rather than a link to a 404.
  const supplierBadge = (): DetailPartContext['supplierBadge'] => {
    if (!config.supplierFieldEnabled || !config.supplierShowOnFrontend) return null
    const name = product.supplier?.trim()
    if (!name) return null
    const linkable = config.supplierPagesEnabled && supplier?.storefrontVisible === true && supplier.slug
    return { name, href: linkable ? supplierHref(supplier.slug!) : null }
  }

  // The order-size deduction line the page OPENS with. On a listing whose
  // combinations a companion module picks (`slot`), the amount on this row is the
  // listing's and the combination the shopper lands on may carry none - so the
  // wording says "some options" and the client island settles it the moment one
  // is chosen. Figures converted to the shop's display side of tax with the same
  // adjuster the price block uses, so the two agree.
  const orderSizeDeductionLineView = () => {
    if (supplier?.orderSizeDeductionThreshold == null) return null
    return orderSizeDeductionView({
      product,
      rule: {
        supplier: supplier.name,
        threshold: supplier.orderSizeDeductionThreshold,
      },
      enabledPriceTypes: config.enabledPriceTypes,
      adjust: displayAdjust,
      currencySymbol: config.currencySymbol,
      someOptionsOnly: slot != null,
      taxView: productTaxView(taxDisplay, product.taxClassId),
    })
  }

  const ctx: DetailPartContext = {
    product,
    images,
    currencySymbol: config.currencySymbol,
    commerce,
    tagSlugs,
    tagBadges,
    digitalFile: digitalFile ? { filename: digitalFile.filename, size: digitalFile.size } : null,
    bp,
    outOfStock,
    lowStock,
    prices,
    priceSuffix: taxDisplay.display.suffix,
    taxView: productTaxView(taxDisplay, product.taxClassId),
    showRetailPrice: config.showRetailPrice,
    supplierLabel: config.supplierFieldEnabled && config.supplierShowOnFrontend ? resolveSupplierLabel(config) : null,
    supplierBadge: supplierBadge(),
    orderSizeDeduction: config.orderSizeDeductionEnabled ? { line: orderSizeDeductionLineView() } : null,
    slot,
    coveredParts,
    layoutBlockTypes: [...blockTypes],
    galleryExtras,
    detailTabs,
    specOverride,
    faqs,
    askQuestion,
    faqSearchPlaceholder: config.productFaqSearchPlaceholder,
    descriptionBody,
    adminEditHref,
    showAdminStock,
    showAdminCodes,
    showAdminReturns,
  }
  const data = injectShopProductDetailEmbed(template, ctx)

  return (
    <div>
      {/* `</` escaped so a description carrying markup (a supplier-imported embed,
          say) cannot terminate this script element early - unescaped, the spilled
          remainder parses as garbage JavaScript and breaks React's hydration of
          the whole product page. Same treatment as ultimate-seo's jsonLdEscape. */}
      {jsonLd && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }} />
      )}
      <Render config={getModuleLayoutPuckRscConfig('shopProductDetail') as any} data={data as Data} metadata={puckMetadata} />
    </div>
  )
}

export const shopProductDetailPuckRscComponent = { ...shopProductDetailPuckComponent, render: ShopProductDetailRsc }
