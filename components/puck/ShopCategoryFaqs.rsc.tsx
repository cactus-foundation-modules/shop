import { connection } from 'next/server'
import { getShopBreakpoints } from '@/modules/shop/lib/breakpoints'
import { getShopConfigCached } from '@/modules/shop/lib/config'
import { getCategoryFaqChainBySlug, getCollectionFaqSetBySlug } from '@/modules/shop/lib/db/catalogue'
import { normaliseFaqItems, resolveCategoryFaqs, type ShpFaqItem } from '@/modules/shop/lib/faq'
import { renderFaqItems } from '@/modules/shop/lib/faq-render'
import { FaqAccordion } from '@/modules/shop/components/public/FaqAccordion'
import { shopCategoryFaqsPuckComponent, type ShopCategoryFaqsProps } from './ShopCategoryFaqs'

// Server (RSC) half of Shop: FAQs. Kept out of the client editor bundle - see
// ShopCategoryFaqs.tsx.
//
// Prints nothing at all when there is nothing to print: no questions written, or
// the whole feature switched off in Shop settings. A block left in a layout
// therefore costs an empty category exactly one thing - no gap, no heading, no
// structured data claiming a page answers questions it does not.

// An answer's own markup is dressed by .faq-a, whose class name is fixed inside
// FaqAccordion so this stylesheet and the product page's cannot drift. The
// `white-space:pre-wrap` that used to do the line breaks is gone: the breaks are
// in the markup now (lib/faq.ts), and pre-wrap would have turned the newlines
// between an author's own tags into blank lines on the page.
//
// The headline matches .spd-tabs h3 on the product page, so the same questions
// look the same wherever a shopper meets them. The list itself matches the FAQ
// (SEO) block - see FaqAccordion.
//
// Two columns is a GRID, not CSS columns: a multi-column list reflows its items
// between columns every time one is opened, so the question a shopper just
// clicked jumps somewhere else on the page as its answer appears. A grid leaves
// each question where it is and lets the row grow. The JSON-LD <script> the
// accordion emits is display:none by UA rule, so it never takes a cell.
//
// The breakpoint is the shop's own tablet one, not a literal: below it there is
// no room for two columns of anything, whatever the block says.
const faqsCss = ({ tabletBp }: { tabletBp: string }) => `
.shop-faqs-title{font-family:var(--display-family,Georgia,serif);font-weight:600;font-size:24px;margin:0 0 14px;color:var(--color-fg)}
.shop-faqs{display:grid;grid-template-columns:1fr;column-gap:40px}
.shop-faqs-2{grid-template-columns:1fr 1fr}
@media (max-width:${tabletBp}){.shop-faqs-2{grid-template-columns:1fr}}
.shop-faq{border-bottom:1px solid var(--color-border);padding:12px 0}
.shop-faq > summary{cursor:pointer;font-weight:600;color:var(--color-fg)}
.shop-faq .faq-a{margin-top:8px;color:var(--color-text)}
.shop-faq .faq-a > *{margin:0 0 8px}
.shop-faq .faq-a > :last-child{margin-bottom:0}
.shop-faq .faq-a ul,.shop-faq .faq-a ol{padding-left:20px}
.shop-faq .faq-a li{margin:2px 0}
.shop-faq .faq-a a{color:var(--color-primary);text-decoration:underline}
.shop-faq .faq-a img{max-width:100%;height:auto}
.shop-faq .faq-a table{border-collapse:collapse;width:100%}
.shop-faq .faq-a th,.shop-faq .faq-a td{border:1px solid var(--color-border);padding:6px 8px;text-align:left}
`

export async function ShopCategoryFaqsRsc(props: ShopCategoryFaqsProps) {
  await connection()
  const [config, bp] = await Promise.all([getShopConfigCached(), getShopBreakpoints()])
  // One switch for the feature, wherever it appears. An owner who has turned
  // FAQs off should not find them still being answered on a category page.
  if (!config.productFaqsEnabled) return null

  const shopWide = normaliseFaqItems(config.productFaqs)

  let items: ShpFaqItem[]
  if (props.collectionSlug) {
    // A collection page. One rung and no chain - a collection has no parent -
    // so `scope` chooses between its own questions alone and its own followed by
    // the shop-wide ones, and a collection that says it does not inherit keeps
    // the shop's off its page whichever is picked.
    const set = await getCollectionFaqSetBySlug(props.collectionSlug)
    items = props.scope === 'inherited' ? resolveCategoryFaqs([set], shopWide) : set.items
  } else if (!props.categorySlug) {
    // A Shop Home or Tag layout: neither carries questions of its own, so the
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

  // One column is the only other answer, so anything that is not '1' is two -
  // including a layout saved before this field existed, which is what makes the
  // block look the same on a page nobody has re-opened since.
  const wrapper = props.columns === '1' ? 'shop-faqs' : 'shop-faqs shop-faqs-2'

  return (
    <section className="shop-faqs-block">
      <style dangerouslySetInnerHTML={{ __html: faqsCss(bp) }} />
      {title ? <h2 className="shop-faqs-title">{title}</h2> : null}
      <FaqAccordion items={renderFaqItems(items)} wrapperClassName={wrapper} itemClassName="shop-faq" />
    </section>
  )
}

export const shopCategoryFaqsPuckRscComponent = {
  ...shopCategoryFaqsPuckComponent,
  render: ShopCategoryFaqsRsc,
}
