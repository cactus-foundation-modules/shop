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

// The other kind of grouping, and deliberately a separate one: a batch says
// WHEN (or how) a line turns up, where a group says what it belongs with. See
// LineMetaBatch in lib/types.ts - shop compares ids, sorts on `sort` and prints
// `heading`, and never looks inside any of the three.
export type LineBatchInfo = {
  id: string
  sort: string
  heading: string
  uniformHeading?: string
  detail?: string
  fieldLabel?: string
}
export type BatchSortable = GroupSortable & { batch?: LineBatchInfo | null }

export type LineBatch<T> = {
  // Empty for the trailing bucket of lines that declared no batch at all.
  id: string
  heading: string
  fieldLabel?: string
  // Every line in this bucket carries the same `detail` (or none does), so the
  // heading already states it and the lines beneath need not repeat it. False
  // where the bucket is mixed - one date, two services - and each line has to
  // say which of them it is on.
  uniform: boolean
  lines: T[]
}

/**
 * Buckets lines for a surface that lists a whole order at once - the checkout's
 * order summary - so everything arriving together is shown together, soonest
 * bucket first.
 *
 * Within a bucket, lines keep the grouped order sortLinesByGroup gives them, and
 * an attachment always follows its main into the main's bucket even when its own
 * batch differs: a desk and its accessories are bought as one thing, and splitting
 * them across two headings to satisfy a date reads as two orders. Lines with no
 * batch (a plain product on a shop where only some things carry a delivery
 * service) fall into one unheaded bucket at the end rather than inventing a
 * heading for them.
 *
 * Buckets ascend by `sort`, ties broken by heading and then by first appearance,
 * so the order is total and stable.
 *
 * A bucket whose lines all carry one `detail` is marked uniform and takes the
 * fuller `uniformHeading`; a mixed one keeps the plain `heading` and leaves each
 * line to state its own detail. Only lines whose OWN batch is this bucket count
 * towards that - an accessory dragged in behind its desk speaks for itself.
 */
export function batchLines<T extends BatchSortable>(lines: readonly T[]): LineBatch<T>[] {
  const ordered = sortLinesByGroup(lines)

  const mainBatch = new Map<string, LineBatchInfo | null>()
  for (const line of ordered) {
    if (line.group?.role === 'main') mainBatch.set(line.group.key, line.batch ?? null)
  }

  const buckets = new Map<string, { batch: LineBatchInfo; seen: number; lines: T[] }>()
  const loose: T[] = []
  ordered.forEach((line, index) => {
    const group = effectiveGroup(line, ordered)
    const batch = group?.role === 'attachment' && mainBatch.has(group.key)
      ? mainBatch.get(group.key)!
      : line.batch ?? null
    if (!batch) { loose.push(line); return }
    const bucket = buckets.get(batch.id)
    if (bucket) bucket.lines.push(line)
    else buckets.set(batch.id, { batch, seen: index, lines: [line] })
  })

  const out = [...buckets.values()]
    .sort((a, b) => {
      if (a.batch.sort !== b.batch.sort) return a.batch.sort < b.batch.sort ? -1 : 1
      if (a.batch.heading !== b.batch.heading) return a.batch.heading < b.batch.heading ? -1 : 1
      return a.seen - b.seen
    })
    .map(({ batch, lines: bucketLines }) => {
      const details = bucketLines.filter((l) => l.batch?.id === batch.id).map((l) => l.batch?.detail ?? '')
      const uniform = details.every((d) => d === details[0])
      return {
        id: batch.id,
        heading: (uniform && batch.uniformHeading) || batch.heading,
        fieldLabel: batch.fieldLabel,
        uniform,
        lines: bucketLines,
      }
    })
  if (loose.length) out.push({ id: '', heading: '', fieldLabel: undefined, uniform: true, lines: loose })
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
