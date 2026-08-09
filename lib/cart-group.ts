// Grouped-line ordering, shared by every surface that lists an order's lines:
// the cart page, the slide-out basket, the checkout review, the confirmation
// page, the order emails and (through its own import) a quote's document. One
// implementation, so a desk and its accessories sit together identically
// wherever they are printed.
//
// Pure and import-free on purpose: half the consumers are client islands and
// half are server renderers, and this must never drag either side's baggage
// into the other. The group shape is the structural one from LineMeta - see
// lib/line-meta.ts (CartLineGroup) for what the fields mean.
//
// Why sorting is needed at all: addToCart unshifts every new line to the top of
// the basket, so a grouped add lands in reverse order (last accessory first,
// the desk beneath), and later adds drift the members apart. Storage is left
// exactly as it is - this orders lines for DISPLAY only.

export type LineGroupInfo = {
  key: string
  role: 'main' | 'attachment'
  caption?: string
  depth?: number
  order?: number
  collectiveLabel?: string
}

// The minimal thing this file sorts: anything that can say which group it is in.
// Consumers pass their own line type and read their own fields back out.
export type GroupSortable = { group?: LineGroupInfo | null }

// A line's group for display: its declared group, EXCEPT that an attachment
// whose main is nowhere in the list is degraded to no-group (rendered flat, no
// indent, no caption) - orphaned indentation under a heading that is not there
// reads as a broken basket. The main's own declaration never degrades.
export function effectiveGroup<T extends GroupSortable>(line: T, all: readonly T[]): LineGroupInfo | null {
  const group = line.group ?? null
  if (!group) return null
  if (group.role === 'main') return group
  const hasMain = all.some((l) => l.group?.key === group.key && l.group.role === 'main')
  return hasMain ? group : null
}

/**
 * Orders lines so every group's attachments sit directly beneath their main.
 *
 * Ungrouped lines and mains keep their relative list order (the shopper's own
 * basket order); each main's attachments follow it immediately, sorted by their
 * declared `order` (absent sorts last), then by list order. Attachments whose
 * main is absent are treated as ungrouped and stay where they were. Stable
 * throughout: two lines the rules cannot separate keep their original order.
 */
export function sortLinesByGroup<T extends GroupSortable>(lines: readonly T[]): T[] {
  const indexOf = new Map<T, number>()
  lines.forEach((line, i) => indexOf.set(line, i))

  const attachmentsByGroup = new Map<string, T[]>()
  const spine: T[] = []
  for (const line of lines) {
    const group = effectiveGroup(line, lines)
    if (group && group.role === 'attachment') {
      const bucket = attachmentsByGroup.get(group.key)
      if (bucket) bucket.push(line)
      else attachmentsByGroup.set(group.key, [line])
    } else {
      spine.push(line)
    }
  }

  for (const bucket of attachmentsByGroup.values()) {
    bucket.sort((a, b) => {
      const ao = a.group?.order ?? Number.MAX_SAFE_INTEGER
      const bo = b.group?.order ?? Number.MAX_SAFE_INTEGER
      if (ao !== bo) return ao - bo
      return (indexOf.get(a) ?? 0) - (indexOf.get(b) ?? 0)
    })
  }

  const out: T[] = []
  for (const line of spine) {
    out.push(line)
    const group = line.group
    if (group && group.role === 'main') {
      const bucket = attachmentsByGroup.get(group.key)
      if (bucket) {
        out.push(...bucket)
        attachmentsByGroup.delete(group.key)
      }
    }
  }
  // Defensive: attachments claiming a key no main used are already in the spine
  // via effectiveGroup, so nothing should be left - but a bucket that somehow is
  // (two mains sharing a key, say) must not vanish from the basket.
  for (const bucket of attachmentsByGroup.values()) out.push(...bucket)
  return out
}

/**
 * The keys of every line that belongs to a main line's group, the main
 * included - what a "remove its accessories too?" action removes and what its
 * undo puts back. `keyOf` is the caller's own line identity (cartLineKey for
 * the live basket). Returns just the main's key when the line leads no group.
 */
export function groupMemberKeys<T extends GroupSortable>(
  main: T,
  all: readonly T[],
  keyOf: (line: T) => string,
): string[] {
  const group = main.group
  if (!group || group.role !== 'main') return [keyOf(main)]
  const keys = [keyOf(main)]
  for (const line of all) {
    if (line !== main && line.group?.key === group.key && line.group.role === 'attachment') keys.push(keyOf(line))
  }
  return keys
}
