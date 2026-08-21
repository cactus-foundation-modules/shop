// The client-safe half of the collection-index source seam: the shapes, and the
// one rule both halves must agree on - which prop key remembers "include this
// source". Kept apart from collection-index-sources.ts because that half reads
// prisma and the module registry, and the Puck editor half of the Collection
// Browser block imports this one.

export type ShopCollectionIndexItem = {
  /** Unique within the provider; only ever used as a React key. */
  id: string
  name: string
  /** Where the card links to. Absolute path, the provider's own to decide. */
  href: string
  description: string | null
  coverUrl: string | null
  /**
   * How many products the page shows, when the provider can say cheaply. Left
   * undefined by a provider whose count would cost a query per card - the card
   * leaves the line out rather than printing a wrong number.
   */
  productCount?: number
}

export type ShopCollectionIndexSource = {
  /** Every item this source contributes, already ordered. */
  list(): Promise<ShopCollectionIndexItem[]>
}

/**
 * The prop key the block uses to remember "yes, include this source". Derived
 * from the extension id so it survives a relabelling, and is safe as a JSON key.
 */
export function collectionIndexSourceProp(id: string): string {
  return `include_${id.replace(/[^a-zA-Z0-9]/g, '_')}`
}
