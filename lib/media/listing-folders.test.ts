import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/db/prisma', () => ({ prisma: {} }))

const {
  categoryFolderPaths, folderPathOfKeyDirectory, folderPathSegment, isListingDepthFolder, listingFolderPath,
  splitFolderPath, uncategorisedFolderPath,
} = await import('@/modules/shop/lib/media/listing-folders')
const { sanitizeFolderSegment } = await import('@/lib/media/organise')

const categories = categoryFolderPaths([
  { id: 'chairs', name: 'Office Chairs', parentId: null },
  { id: 'modular', name: 'Modular Seating', parentId: 'chairs' },
  { id: 'orphan', name: 'Lost Things', parentId: 'deleted-parent' },
])

describe('folderPathSegment', () => {
  it('matches the path a folder named after the listing actually resolves to', () => {
    // The 60-character cut lands straight after a hyphen. The folder is created
    // with that hyphen and the storage path drops it, so a comparison against the
    // single-pass name reported this listing as misfiled for ever.
    const name = 'Echo Medium Back Leather Stackable Cantilever Visitor Chair with Arms'
    const storedFolderName = sanitizeFolderSegment(name)
    expect(storedFolderName.endsWith('-')).toBe(true)
    expect(folderPathSegment(name)).toBe(sanitizeFolderSegment(storedFolderName))
    expect(folderPathSegment(name).endsWith('-')).toBe(false)
  })

  it('never yields an empty segment', () => {
    expect(folderPathSegment('...')).toBe('folder')
  })
})

describe('categoryFolderPaths', () => {
  it('nests a sub-category inside its parent', () => {
    expect(categories.get('modular')).toBe('shop/office-chairs/modular-seating')
  })

  it('starts the trail at the shop when a parent no longer exists', () => {
    expect(categories.get('orphan')).toBe('shop/lost-things')
  })

  it('survives a cycle in corrupt data', () => {
    const cyclic = categoryFolderPaths([
      { id: 'a', name: 'A', parentId: 'b' },
      { id: 'b', name: 'B', parentId: 'a' },
    ])
    expect(cyclic.get('a')).toMatch(/^shop\//)
  })
})

describe('listingFolderPath', () => {
  it('files a listing under its master category trail', () => {
    expect(listingFolderPath('modular', 'Brixworth Modular Office Soft Seating', categories))
      .toBe('shop/office-chairs/modular-seating/brixworth-modular-office-soft-seating')
  })

  it('files a listing with no master, or a deleted one, under Uncategorised', () => {
    expect(listingFolderPath(null, 'Widget', categories)).toBe(`${uncategorisedFolderPath()}/widget`)
    expect(listingFolderPath('gone', 'Widget', categories)).toBe('shop/uncategorised/widget')
  })
})

describe('isListingDepthFolder', () => {
  it('accepts a folder directly inside a category', () => {
    expect(isListingDepthFolder('shop/office-chairs/modular-seating/old-name', categories)).toBe(true)
    expect(isListingDepthFolder('shop/uncategorised/old-name', categories)).toBe(true)
  })

  it('refuses a sub-category, which sits one level below its parent exactly as a listing does', () => {
    // Mistaking this for a listing folder would carry every product filed in the
    // sub-category into one listing.
    expect(isListingDepthFolder('shop/office-chairs/modular-seating', categories)).toBe(false)
  })

  it('refuses anything deeper, shallower or outside the shop', () => {
    expect(isListingDepthFolder('shop/office-chairs/modular-seating/old-name/variations', categories)).toBe(false)
    expect(isListingDepthFolder('shop', categories)).toBe(false)
    expect(isListingDepthFolder('dynamic', categories)).toBe(false)
    expect(isListingDepthFolder('shop/uncategorised', categories)).toBe(false)
  })
})

describe('folderPathOfKeyDirectory', () => {
  it('reads the folder path out of a proxied key directory', () => {
    expect(folderPathOfKeyDirectory('media/shop/office-chairs', 'B2')).toBe('shop/office-chairs')
    expect(folderPathOfKeyDirectory('media/R2/shop/office-chairs', 'R2')).toBe('shop/office-chairs')
    expect(folderPathOfKeyDirectory('media', 'B2')).toBe('')
  })

  it('says nothing about a key from another scheme', () => {
    expect(folderPathOfKeyDirectory('shop/office-chairs', 'B2')).toBeNull()
    expect(folderPathOfKeyDirectory('media/R2/shop', 'B2')).toBe('R2/shop')
    expect(folderPathOfKeyDirectory('media/shop', 'R2')).toBeNull()
  })
})

describe('splitFolderPath', () => {
  it('splits off the last segment', () => {
    expect(splitFolderPath('shop/chairs/x')).toEqual({ parent: 'shop/chairs', leaf: 'x' })
    expect(splitFolderPath('shop')).toEqual({ parent: '', leaf: 'shop' })
  })
})
