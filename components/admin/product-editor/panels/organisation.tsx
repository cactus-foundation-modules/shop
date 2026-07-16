'use client'

import { useMemo } from 'react'
import { Field, Grid, Section, Select } from '@/modules/shop/components/admin/product-editor/fields'
import type { CategoryTerm, EditorState, PanelProps, Term } from '@/modules/shop/components/admin/product-editor/model'

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

export function OrganisationPanel({ state, setField, patch, categories, tags, collections }: PanelProps & {
  categories: CategoryTerm[]
  tags: Term[]
  collections: Term[]
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
        <CheckList items={tags} selected={state.tagIds} onToggle={setIds('tagIds')} empty="No tags yet. Add some under Shop, then Products." />
      </Section>

      <Section title="Collections" blurb="Hand-picked groupings, like Summer Sale or Staff Picks.">
        <CheckList items={collections} selected={state.collectionIds} onToggle={setIds('collectionIds')} empty="No collections yet. Add some under Shop, then Collections." />
      </Section>
    </div>
  )
}
