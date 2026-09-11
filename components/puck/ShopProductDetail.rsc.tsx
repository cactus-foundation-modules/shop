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
import { makeDisplayAdjuster, resolveTaxDisplay } from '@/modules/shop/lib/tax-display'
import { injectShopProductDetailEmbed } from '@/modules/shop/lib/inject-part-context'
import { resolveShopDetailProvider, narrowShopDetailSlot, coveredByLayoutBlocks, collectLayoutBlockTypes } from '@/modules/shop/lib/detail-slot'
import { resolveShopDetailTabs } from '@/modules/shop/lib/detail-tabs'
import { resolveShopDetailSpec } from '@/modules/shop/lib/detail-spec'
import { getProductFaqCategoryChain } from '@/modules/shop/lib/db/catalogue'
import { normaliseFaqItems, resolveProductFaqs } from '@/modules/shop/lib/faq'
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
  const [media, config, taxDisplay, bp, tags, tagIds, template, provider, galleryExtras, detailTabs, specOverride, adminEditHref, showAdminStock, showAdminCodes, showAdminReturns, merchantFacts, deliveryOptions, rating] = await Promise.all([
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
  ])
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
  const faqs = config.productFaqsEnabled
    ? resolveProductFaqs({
        product: product.faqs,
        categories: product.faqs.inherit ? await getProductFaqCategoryChain(product.id) : [],
        shopWide: normaliseFaqItems(config.productFaqs),
      })
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

  // One resolution of the product's price types for the whole page: the parts
  // read it, and the structured data below quotes the same figure, so a search
  // result can never advertise a price the page does not charge. Converted to
  // whichever side of tax the shop prints on (lib/tax-display.ts) here rather
  // than per part, so the JSON-LD below quotes the figure on screen - a search
  // result showing the net price of a shop that quotes gross is a mis-price.
  const displayAdjust = makeDisplayAdjuster(taxDisplay, product.taxClassId)
  const prices = priceView(product, config.enabledPriceTypes, displayAdjust)

  const offerAvailability = product.isPreOrder
    ? 'https://schema.org/PreOrder'
    : outOfStock
      ? 'https://schema.org/OutOfStock'
      : 'https://schema.org/InStock'

  // A variations product has no one price: the shopper picks a combination and
  // the figure moves. Structured data says so with an AggregateOffer quoting the
  // cheapest choice - the same "from" figure the product cards print, converted
  // to the displayed side of tax like every figure on the page. A single Offer
  // claiming the parent's own price invites a Merchant Center mismatch the
  // moment Google compares this page against a variation's feed price.
  const fromPrice = variantPricing
    ? (displayAdjust ? displayAdjust(Number(variantPricing.price)) : Number(variantPricing.price)).toFixed(2)
    : null

  // Google reads a second, higher price marked `StrikethroughPrice` as the "was"
  // of an offer. Two figures can fill that slot and only one at a time. A genuine
  // sale takes it, because the normal price is what the saving printed on the
  // page is measured against. Failing that an RRP does, but only where the owner
  // has switched it on: an RRP is a figure this shop never charged, so handing it
  // to Google as a strikethrough is a decision rather than a default, and it is
  // doubly gated on the RRP already being printed beside the price (Shop settings
  // > Pricing) so the markup can never claim a saving the shopper cannot see.
  const rrpInSearch = config.showRetailPrice && config.retailPriceInStructuredData
  const adjusted = (amount: string) => (displayAdjust ? displayAdjust(Number(amount)) : Number(amount)).toFixed(2)

  // The variations branch takes the cheapest choice's RRP - the same pairing the
  // product cards print, "From £x" against the lowest RRP any choice carries -
  // because the parent row's own figures price nothing a shopper can buy. It has
  // no "was": the provider hands back a cheapest price, not a cheapest saving, so
  // a reduced variations listing carries no strikethrough at all rather than the
  // parent's unrelated one.
  const strikethrough = fromPrice
    ? rrpInSearch && variantPricing?.rrp
      ? adjusted(variantPricing.rrp)
      : null
    : (prices.was ?? (rrpInSearch ? prices.rrp : null))

  // The delivery services this product can be bought with, priced on the side of
  // tax the page prints. The charge rides on the product line and is taxed at
  // the product's own rate, so it converts with the product's own adjuster -
  // anything else would quote a gross price against a net delivery.
  const shippingOptions: ShopShippingOption[] = deliveryOptions.map((option) => ({
    label: option.label,
    description: option.description,
    price: (displayAdjust ? displayAdjust(option.price) : option.price).toFixed(2),
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

  const jsonLd = buildProductJsonLd({
    name: product.name,
    description: stripHtmlToPlainText(product.shortDescription ?? product.description ?? '') || undefined,
    images: media.map((m) => m.url),
    url: productUrl(getSiteUrl(), product.slug, config.productUrlStyle),
    sku: product.sku,
    currency: config.currency,
    availability: offerAvailability,
    ...(fromPrice
      ? {
          lowPrice: fromPrice,
          highPrice: variantPricing?.highPrice ? adjusted(variantPricing.highPrice) : null,
          offerCount: variantPricing?.offerCount ?? null,
        }
      : { price: prices.now }),
    strikethrough,
    hidePrices: commerce.hidePrices,
    identifiers: merchantFacts.identifiers.get(product.id) ?? { gtin: product.barcode },
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
      ? <Render config={getModuleLayoutPuckRscConfig('shopProductDescription') as any} data={product.descriptionPuck as Data} />
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
      <Render config={getModuleLayoutPuckRscConfig('shopProductDetail') as any} data={data as Data} />
    </div>
  )
}

export const shopProductDetailPuckRscComponent = { ...shopProductDetailPuckComponent, render: ShopProductDetailRsc }
