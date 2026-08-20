'use client'

import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'

/**
 * Pictures another module owns, shown INSIDE the product editor's Images grid.
 *
 * The Images tab used to be the product's own photographs and nothing else, and a
 * module with pictures of its own (the variations module's "Image up front" ones)
 * could only hang a tick box underneath saying which side of the grid its set
 * landed on. That is a poor way to describe an order: the owner wants to see the
 * gallery the shopper will see and drag it into shape, not reason about two piles.
 *
 * So a module registers its pictures here and shop draws them among its own, in
 * one grid, with one set of arrows. Shop knows nothing about what they are - it
 * is handed a url, a badge to print on the tile and three callbacks - and the
 * module keeps ownership of what the order, the description and the × actually
 * mean at its end.
 *
 * The order is a single ordinal space: `position` is a tile's index in the
 * FINISHED gallery, the product's own photographs and the contributed ones
 * counted together. Null means "after the product's own", which is where a
 * newly contributed picture starts. See mergeGalleryRows in panels/media.tsx for
 * the reconstruction, which is deliberately forgiving: delete one of the
 * product's own photographs and the contributed ones shuffle up rather than
 * stranding themselves past the end.
 */

export type GalleryExtraItem = {
  /** Stable within this product, and the id every callback is keyed by. */
  id: string
  url: string
  altText: string
  /** Printed on the tile: what KIND of picture this is, e.g. "Variation". */
  badge: string
  /** One line under the picture saying WHICH one, e.g. "Oak / 1600mm". */
  caption?: string
  /** What the × does, in words, for its tooltip and screen readers. */
  removeLabel?: string
  /** Index in the finished gallery; null for "after the product's own". */
  position: number | null
}

/** What the owning module does when the admin drags, describes or removes a tile. */
export type GalleryExtraHandlers = {
  /** Every one of this source's tiles, with its new index in the finished gallery. */
  reorder: (order: Array<{ id: string; position: number }>) => void
  setAltText: (id: string, altText: string) => void
  /** The × was pressed. What that means is the module's business - the variations
   * module takes the picture off the gallery and leaves it on its variation. */
  remove: (id: string) => void
}

type Source = { items: GalleryExtraItem[]; handlers: { current: GalleryExtraHandlers } }

type Registry = {
  register: (key: string, source: Source) => void
  unregister: (key: string) => void
}

const RegistryContext = createContext<Registry | null>(null)
const SourcesContext = createContext<ReadonlyArray<[string, Source]>>([])

/** Wraps the Images tab so contributed tiles and the grid can find each other. */
export function GalleryExtrasProvider({ children }: { children: ReactNode }) {
  const [sources, setSources] = useState<Record<string, Source>>({})

  const register = useCallback((key: string, source: Source) => {
    setSources((s) => ({ ...s, [key]: source }))
  }, [])
  const unregister = useCallback((key: string) => {
    setSources((s) => {
      if (!(key in s)) return s
      const next = { ...s }
      delete next[key]
      return next
    })
  }, [])

  const registry = useMemo(() => ({ register, unregister }), [register, unregister])
  const entries = useMemo(() => Object.entries(sources), [sources])

  return (
    <RegistryContext.Provider value={registry}>
      <SourcesContext.Provider value={entries}>{children}</SourcesContext.Provider>
    </RegistryContext.Provider>
  )
}

/**
 * Contribute pictures to the Images grid. Call it unconditionally from a client
 * component rendered inside the Images tab (a `shop.product-editor-media-sections`
 * contribution is exactly that). Inert outside the product editor, so the same
 * component can be reused on a standalone screen without branching.
 *
 * `items` may be a fresh array on every render - the registration is keyed off its
 * contents, not its identity, so a caller does not have to memoise. The handlers
 * are held in a ref for the same reason: they close over the module's own state
 * and change on every keystroke, and re-registering for that would put the grid
 * into a loop.
 */
export function useRegisterGalleryExtras(items: GalleryExtraItem[], handlers: GalleryExtraHandlers) {
  const registry = useContext(RegistryContext)
  const key = useId()

  const handlersRef = useRef(handlers)
  useEffect(() => { handlersRef.current = handlers })

  const signature = JSON.stringify(items)
  useEffect(() => {
    if (!registry) return
    registry.register(key, { items: JSON.parse(signature) as GalleryExtraItem[], handlers: handlersRef })
    return () => registry.unregister(key)
  }, [registry, key, signature])
}

export type GalleryExtras = {
  /** Every contributed tile across every source, in gallery order. */
  items: GalleryExtraItem[]
  /** Hand back the whole set's new indexes; each source is told about its own. */
  reorder: (order: Array<{ id: string; position: number }>) => void
  setAltText: (id: string, altText: string) => void
  remove: (id: string) => void
}

/** The grid's side of the bargain: what to draw, and where to send a gesture. */
export function useGalleryExtras(): GalleryExtras {
  const entries = useContext(SourcesContext)

  return useMemo(() => {
    // Sorted once, here, so the grid can walk the list in step with the product's
    // own images. Unplaced tiles (null) go last, and ties keep the order their
    // source listed them in - a stable sort, so two pictures promoted at the same
    // moment do not swap places on a reload.
    const items = entries
      .flatMap(([, source]) => source.items)
      .map((item, index) => ({ item, index }))
      .sort((a, b) => {
        const ap = a.item.position ?? Number.POSITIVE_INFINITY
        const bp = b.item.position ?? Number.POSITIVE_INFINITY
        return ap - bp || a.index - b.index
      })
      .map(({ item }) => item)

    const ownerOf = (id: string) => entries.find(([, source]) => source.items.some((i) => i.id === id))?.[1]

    return {
      items,
      reorder: (order) => {
        for (const [, source] of entries) {
          const mine = order.filter((o) => source.items.some((i) => i.id === o.id))
          if (mine.length > 0) source.handlers.current.reorder(mine)
        }
      },
      setAltText: (id, altText) => ownerOf(id)?.handlers.current.setAltText(id, altText),
      remove: (id) => ownerOf(id)?.handlers.current.remove(id),
    }
  }, [entries])
}
