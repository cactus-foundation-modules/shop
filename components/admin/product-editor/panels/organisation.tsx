'use client'

import { useState, useMemo } from 'react'
import { Field, Grid, Section, Select } from '@/modules/shop/components/admin/product-editor/fields'
import type { CategoryTerm, EditorState, PanelProps, TagTerm, Term } from '@/modules/shop/components/admin/product-editor/model'

function toggle(list: string[], id: string): string[] {
  return list.includes(id) ? list.filter((x) => x !== id) : [...list, id]
}

function CheckList({ items, selected, onToggle, empty, indentOf }: {
  items: Term[]
  selected: string[]
  onToggle: (id: string) => void
  empty: string
  indentOf?: (id: string) => number
}) {
  if (items.length === 0) return <p className="spe-check-empty">{empty}</p>
  return (
    <div className="spe-checks">
      {items.map((item) => (
        <label key={item.id} className="spe-check" style={indentOf ? { paddingLeft: `${0.5 + indentOf(item.id) * 1.125}rem` } : undefined}>
          <input type="checkbox" checked={selected.includes(item.id)} onChange={() => onToggle(item.id)} />
          {item.name}
        </label>
      ))}
    </div>
  )
}

// Make a tag without leaving the product. The panel only holds the box and the
// button; the editor above owns the request and the refreshed list, the same
// split the supplier field uses.
function AddTag({ onCreate }: { onCreate: (name: string) => Promise<{ id: string } | string> }) {
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    const trimmed = name.trim()
    if (trimmed === '' || busy) return
    setBusy(true)
    const result = await onCreate(trimmed)
    setBusy(false)
    if (typeof result === 'string') { setError(result); return }
    setError(null)
    setName('')
  }

  return (
    <div className="spe-add-tag">
      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginTop: '0.5rem' }}>
        <input
          value={name}
          placeholder="New tag name"
          aria-label="New tag name"
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void submit() } }}
        />
        <button type="button" className="btn btn-secondary" disabled={busy || name.trim() === ''} onClick={() => void submit()}>
          {busy ? 'Adding…' : 'Add tag'}
        </button>
      </div>
      {error && <p style={{ color: 'var(--color-danger)', fontSize: '0.75rem', margin: '0.25rem 0 0' }}>{error}</p>}
    </div>
  )
}

export function OrganisationPanel({ state, setField, patch, categories, tags, collections, createTag }: PanelProps & {
  categories: CategoryTerm[]
  tags: TagTerm[]
  collections: Term[]
  // Absent where a caller has not wired it; the panel then simply offers no
  // "add tag" box and points at the Tags page instead.
  createTag?: (name: string) => Promise<{ id: string } | string>
}) {
  const f = state.form

  // Flatten the category tree once, in display order, so nesting reads at a glance.
  const { ordered, depthOf } = useMemo(() => {
    const rows: CategoryTerm[] = []
    const depth = new Map<string, number>()
    const childrenOf = (pid: string | null) =>
      categories.filter((c) => (c.parentId ?? null) === pid).sort((a, b) => (a.position - b.position) || a.name.localeCompare(b.name))
    const walk = (pid: string | null, d: number) => {
      for (const c of childrenOf(pid)) { rows.push(c); depth.set(c.id, d); walk(c.id, d + 1) }
    }
    walk(null, 0)
    return { ordered: rows, depthOf: (id: string) => depth.get(id) ?? 0 }
  }, [categories])

  // A tag that applies itself gets no checkbox: ticking it would write a row
  // nothing reads and would go stale the next time a price moved.
  const pickable = useMemo(() => tags.filter((t) => !t.autoRule), [tags])
  const automatic = useMemo(() => tags.filter((t) => t.autoRule), [tags])

  const chosenCategories = categories.filter((c) => state.categoryIds.includes(c.id))
  const masterName = categories.find((c) => c.id === f.masterCategoryId)?.name ?? 'uncategorised'

  const setIds = (key: 'categoryIds' | 'tagIds' | 'collectionIds') => (id: string) =>
    patch((s: EditorState) => {
      const next = toggle(s[key], id)
      return { ...s, [key]: next }
    })

  return (
    <div className="spe-panel">
      <Section title="Categories" blurb="Where the product sits in your shop's shelves. A product can live on more than one shelf.">
        <Grid>
          <CheckList
            items={ordered}
            selected={state.categoryIds}
            indentOf={depthOf}
            empty="No categories yet. Add some under Shop, then Categories."
            onToggle={(id) => patch((s) => {
              const nextIds = toggle(s.categoryIds, id)
              // Unticking the master category cannot leave it as the master.
              const master = s.form.masterCategoryId === id && !nextIds.includes(id) ? '' : s.form.masterCategoryId
              return { ...s, categoryIds: nextIds, form: { ...s.form, masterCategoryId: master } }
            })}
          />
          <Field
            label="Lead category"
            hint={`The main one, used for the breadcrumb and for filing images. Pictures land in shop / ${masterName} / ${f.slug || 'product'}.`}
          >
            {(p) => (
              <Select {...p} value={f.masterCategoryId} onChange={(e) => setField('masterCategoryId', e.target.value)}>
                <option value="">No lead category</option>
                {chosenCategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            )}
          </Field>
        </Grid>
      </Section>

      <Section title="Tags" blurb="Loose labels for search and filtering. Nothing to do with categories.">
        <CheckList items={pickable} selected={state.tagIds} onToggle={setIds('tagIds')} empty="No tags yet. Add one below, or set them up under Shop, then Tags." />
        {automatic.length > 0 && (
          <p className="spe-hint" style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', margin: '0.5rem 0 0' }}>
            {automatic.map((t) => t.name).join(', ')} {automatic.length === 1 ? 'looks after itself' : 'look after themselves'} - a product joins
            while it is reduced, whether the discount is on the product or on one of its variations, and drops out again when it is not.
          </p>
        )}
        {createTag && (
          <AddTag onCreate={async (name) => {
            const result = await createTag(name)
            // A tag made here is meant for the product in hand, so tick it.
            if (typeof result !== 'string') patch((s) => ({ ...s, tagIds: [...s.tagIds, result.id] }))
            return result
          }} />
        )}
      </Section>

      <Section title="Collections" blurb="Hand-picked groupings, like Summer Sale or Staff Picks.">
        <CheckList items={collections} selected={state.collectionIds} onToggle={setIds('collectionIds')} empty="No collections yet. Add some under Shop, then Collections." />
      </Section>
    </div>
  )
}
