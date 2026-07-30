import { connection } from 'next/server'
import { getCategoryBySlug } from '@/modules/shop/lib/db/catalogue'
import { ShopCategoryDescriptionBody } from '@/modules/shop/components/public/ShopCategoryDescriptionBody'
import { shopCategoryDescriptionPuckComponent, type ShopCategoryDescriptionProps } from './ShopCategoryDescription'

// Server (RSC) half of Shop: Category Description. Kept out of the client editor
// bundle - see ShopCategoryDescription.tsx.
//
// Prints the designed description the owner built for this category, or its
// plain-text description when there is no design. Nothing when there is neither,
// so a layout carrying this block does not leave a gap on the categories that
// have not been written up yet.

export async function ShopCategoryDescriptionRsc(props: ShopCategoryDescriptionProps) {
  await connection()
  if (!props.categorySlug) return null
  // The single-category fetch, not listCategories - it is the one that carries
  // the designed description document.
  const category = await getCategoryBySlug(props.categorySlug)
  if (!category) return null
  return <ShopCategoryDescriptionBody category={category} />
}

export const shopCategoryDescriptionPuckRscComponent = {
  ...shopCategoryDescriptionPuckComponent,
  render: ShopCategoryDescriptionRsc,
}
