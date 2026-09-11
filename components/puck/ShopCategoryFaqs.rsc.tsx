import { connection } from 'next/server'
import { getShopConfigCached } from '@/modules/shop/lib/config'
import { getCategoryFaqChainBySlug } from '@/modules/shop/lib/db/catalogue'
import { normaliseFaqItems, resolveCategoryFaqs, type ShpFaqItem } from '@/modules/shop/lib/faq'
import { FaqAccordion } from '@/modules/shop/components/public/FaqAccordion'
import { shopCategoryFaqsPuckComponent, type ShopCategoryFaqsProps } from './ShopCategoryFaqs'

// Server (RSC) half of Shop: FAQs. Kept out of the client editor bundle - see
// ShopCategoryFaqs.tsx.
//
// Prints nothing at all when there is nothing to print: no questions written, or
// the whole feature switched off in Shop settings. A block left in a layout
// therefore costs an empty category exactly one thing - no gap, no heading, no
// structured data claiming a page answers questions it does not.

// The headline matches .spd-tabs h3 on the product page, so the same questions
// look the same wherever a shopper meets them. The list itself matches the FAQ
// (SEO) block - see FaqAccordion.
const faqsCss = `
.shop-faqs-title{font-family:var(--display-family,Georgia,serif);font-weight:600;font-size:24px;margin:0 0 14px;color:var(--color-fg)}
.shop-faq{border-bottom:1px solid var(--color-border);padding:12px 0}
.shop-faq > summary{cursor:pointer;font-weight:600;color:var(--color-fg)}
.shop-faq p{margin:8px 0 0;color:var(--color-text);white-space:pre-wrap}
`

export async function ShopCategoryFaqsRsc(props: ShopCategoryFaqsProps) {
  await connection()
  const config = await getShopConfigCached()
  // One switch for the feature, wherever it appears. An owner who has turned
  // FAQs off should not find them still being answered on a category page.
  if (!config.productFaqsEnabled) return null

  const shopWide = normaliseFaqItems(config.productFaqs)

  let items: ShpFaqItem[]
  if (!props.categorySlug) {
    // A Collection or Tag layout: neither carries questions of its own, so the
    // shop-wide list is the only thing there is to show. Said in the field hint
    // too, since the "Questions to show" setting has nothing to choose between
    // here.
    items = shopWide
  } else if (props.scope === 'inherited') {
    items = resolveCategoryFaqs(await getCategoryFaqChainBySlug(props.categorySlug), shopWide)
  } else {
    // The default. Only this category's own questions, because the shop-wide
    // ones are already answered on every product beneath it - printing them here
    // as well would put identical FAQPage markup on the category and on
    // everything in it. One walk either way; the chain's first rung IS this
    // category, and an unknown slug hands back nothing.
    const chain = await getCategoryFaqChainBySlug(props.categorySlug)
    items = chain[0]?.items ?? []
  }

  if (items.length === 0) return null
  const title = props.title?.trim()

  return (
    <section className="shop-faqs-block">
      <style dangerouslySetInnerHTML={{ __html: faqsCss }} />
      {title ? <h2 className="shop-faqs-title">{title}</h2> : null}
      <FaqAccordion items={items} wrapperClassName="shop-faqs" itemClassName="shop-faq" />
    </section>
  )
}

export const shopCategoryFaqsPuckRscComponent = {
  ...shopCategoryFaqsPuckComponent,
  render: ShopCategoryFaqsRsc,
}
