import { connection } from 'next/server'
import { getCollectionBySlug } from '@/modules/shop/lib/db/catalogue'
import { ShopCollectionDescriptionBody } from '@/modules/shop/components/public/ShopCollectionDescriptionBody'
import { shopCollectionDescriptionPuckComponent, type ShopCollectionDescriptionProps } from './ShopCollectionDescription'

// Server (RSC) half of Shop: Collection Description. Kept out of the client
// editor bundle - see ShopCollectionDescription.tsx.
//
// Prints the designed description the owner built for this collection, or its
// plain-text description when there is no design. Nothing when there is neither,
// so a layout carrying this block does not leave a gap on the collections that
// have not been written up yet.

export async function ShopCollectionDescriptionRsc(props: ShopCollectionDescriptionProps) {
  await connection()
  if (!props.collectionSlug) return null
  const collection = await getCollectionBySlug(props.collectionSlug)
  if (!collection) return null
  return <ShopCollectionDescriptionBody collection={collection} />
}

export const shopCollectionDescriptionPuckRscComponent = {
  ...shopCollectionDescriptionPuckComponent,
  render: ShopCollectionDescriptionRsc,
}
