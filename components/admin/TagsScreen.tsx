'use client'

import { useCallback, useEffect, useState, type CSSProperties } from 'react'
import { ColourPickerRow } from '@/components/admin/ColourPickerRow'
import type { GlobalColour } from '@/lib/design/tokens'
import { useAlert, useConfirm, usePrompt } from '@/modules/shop/components/admin/dialogs'

// Shop > Catalogue > Tags. Until this screen existed a tag could only be made by
// the CSV importer or by hand in the database, while the product editor cheerily
// told owners to "add some under Shop, then Products" - a page that had no such
// button. This is that page.
//
// A tag is: a name, a url, whether shoppers ever see it, an optional badge with
// its own colours, and its place in the order. Colours are picked from the site
// palette (admin > Appearance > Styles) or freely, and are stored as the value
// itself rather than as a palette reference - see migrations/019_tag_display.sql
// for why. Every colour is passed through the site's CSS-value sanitiser before
// it reaches a storefront style.

type Tag = {
  id: string
  name: string
  slug: string
  description: string | null
  storefrontVisible: boolean
  badgeEnabled: boolean
  badgeLabel: string | null
  badgeBg: string | null
  badgeBgDark: string | null
  badgeText: string | null
  badgeTextDark: string | null
  position: number
  metaTitle: string | null
  metaDescription: string | null
  // Set on a tag that applies itself - today only "On Sale", whose membership is
  // "has money off right now", product or variation. Such a tag is never ticked
  // on a product, so its product count is always 0 and is not printed.
  autoRule: 'sale' | null
  productCount: number
}

// What the editor holds while it is open. Nulls become empty strings on the way
// in and back to nulls on the way out, so a cleared box saves as "unset" rather
// than as an empty string the storefront would then try to paint with.
type Draft = {
  name: string
  slug: string
  description: string
  storefrontVisible: boolean
  badgeEnabled: boolean
  badgeLabel: string
  badgeBg: string
  badgeBgDark: string
  badgeText: string
  badgeTextDark: string
  metaTitle: string
  metaDescription: string
}

const inputStyle: CSSProperties = {
  width: '100%', padding: '0.375rem 0.5rem', border: '1px solid var(--color-border)', borderRadius: 6,
  fontSize: '0.875rem', fontFamily: 'inherit', background: 'var(--color-bg)', color: 'var(--color-text)',
}
const rowStyle: CSSProperties = {
  border: '1px solid var(--color-border)', borderRadius: 8, background: 'var(--color-surface)',
}
const linkButton: CSSProperties = {
  background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: '0.8125rem', color: 'var(--color-text-secondary)',
}
const hintStyle: CSSProperties = { fontSize: '0.75rem', color: 'var(--color-text-secondary)', margin: '0.25rem 0 0' }
const labelStyle: CSSProperties = { display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: '0.25rem' }

function draftOf(tag: Tag): Draft {
  return {
    name: tag.name,
    slug: tag.slug,
    description: tag.description ?? '',
    storefrontVisible: tag.storefrontVisible,
    badgeEnabled: tag.badgeEnabled,
    badgeLabel: tag.badgeLabel ?? '',
    badgeBg: tag.badgeBg ?? '',
    badgeBgDark: tag.badgeBgDark ?? '',
    badgeText: tag.badgeText ?? '',
    badgeTextDark: tag.badgeTextDark ?? '',
    metaTitle: tag.metaTitle ?? '',
    metaDescription: tag.metaDescription ?? '',
  }
}

function orNull(value: string): string | null {
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

// The badge as the light-mode card will print it. Deliberately not theme-aware:
// the two previews sit side by side so an owner can see both at once, which is
// the only way to catch a dark-mode label that has gone invisible.
function BadgePreview({ label, bg, text, caption }: { label: string; bg: string; text: string; caption: string }) {
  return (
    <div style={{ display: 'grid', gap: '0.25rem', justifyItems: 'start' }}>
      <span style={{
        display: 'inline-block', fontSize: 12, fontWeight: 600, lineHeight: 1, padding: '5px 9px', borderRadius: 6,
        background: bg || 'var(--color-surface)', color: text || 'var(--color-text-muted)',
        border: bg ? 'none' : '1px solid var(--color-border)',
      }}>{label || 'Badge'}</span>
      <span style={{ fontSize: '0.6875rem', color: 'var(--color-text-secondary)' }}>{caption}</span>
    </div>
  )
}

export function TagsScreen() {
  const [tags, setTags] = useState<Tag[]>([])
  const [colours, setColours] = useState<GlobalColour[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [saving, setSaving] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [confirm, confirmNode] = useConfirm()
  const [promptText, promptNode] = usePrompt()
  const [alert, alertNode] = useAlert()

  // Written as a .then chain rather than async/await so every setState sits in a
  // callback, which is what the effect below needs it to be.
  const refresh = useCallback(() => {
    return fetch('/api/m/shop/admin/tags')
      .then(async (r) => { if (r.ok) setTags((await r.json()).tags) })
      .catch(() => {})
      .finally(() => setLoaded(true))
  }, [])

  useEffect(() => { void refresh() }, [refresh])

  // The site's own palette, so the colour pickers offer the same swatches the
  // Appearance screens do. Any admin may read it; if the call fails the pickers
  // simply show the free colour input with no swatches beside it.
  useEffect(() => {
    void fetch('/api/admin/appearance')
      .then(async (r) => {
        if (!r.ok) return
        const data = await r.json()
        const list = data?.designTokens?.designSystem?.colours
        if (Array.isArray(list)) setColours(list as GlobalColour[])
      })
      .catch(() => {})
  }, [])

  async function createTag() {
    const name = await promptText({ title: 'New tag', placeholder: 'Tag name', confirmLabel: 'Create' })
    if (!name) return
    const r = await fetch('/api/m/shop/admin/tags', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }),
    })
    if (!r.ok) {
      // The one failure an owner will actually hit: shp_tags.name is unique.
      await alert('A tag with that name already exists.', 'Could not create the tag')
      return
    }
    await refresh()
  }

  function startEdit(tag: Tag) {
    setEditingId(tag.id)
    setDraft(draftOf(tag))
  }

  async function save(tag: Tag) {
    if (!draft) return
    if (draft.name.trim() === '') {
      await alert('A tag needs a name.', 'Nothing to save')
      return
    }
    // The slug is what the tag's page lives at and what any Product Grid or
    // filter block pointed at this tag is holding, so changing it is a decision,
    // not a side effect of a rename.
    if (draft.slug.trim() !== tag.slug) {
      const ok = await confirm({
        title: 'Change the web address?',
        message: `This tag currently lives at /shop/tag/${tag.slug}. Any link or page block pointing at the old address will stop finding it.`,
        confirmLabel: 'Change it',
        danger: false,
      })
      if (!ok) return
    }
    setSaving(true)
    const r = await fetch(`/api/m/shop/admin/tags/${tag.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: draft.name.trim(),
        slug: draft.slug.trim(),
        description: orNull(draft.description),
        storefrontVisible: draft.storefrontVisible,
        badgeEnabled: draft.badgeEnabled,
        badgeLabel: orNull(draft.badgeLabel),
        badgeBg: orNull(draft.badgeBg),
        badgeBgDark: orNull(draft.badgeBgDark),
        badgeText: orNull(draft.badgeText),
        badgeTextDark: orNull(draft.badgeTextDark),
        metaTitle: orNull(draft.metaTitle),
        metaDescription: orNull(draft.metaDescription),
      }),
    })
    setSaving(false)
    if (!r.ok) {
      await alert('That name is already taken by another tag.', 'Could not save')
      return
    }
    setEditingId(null)
    setDraft(null)
    await refresh()
  }

  async function remove(tag: Tag) {
    const used = tag.productCount === 1 ? '1 product uses it' : `${tag.productCount} products use it`
    const ok = await confirm({
      title: `Delete "${tag.name}"?`,
      message: tag.autoRule
        ? 'This one applies itself to whatever is reduced. Delete it and the sale badge and its page go with it, and there is no way to bring it back short of the next update.'
        : tag.productCount > 0
          ? `${used}. They will keep everything else - they just lose this label, and its page goes with it.`
          : 'Nothing is filed under it, so nothing else changes.',
    })
    if (!ok) return
    await fetch(`/api/m/shop/admin/tags/${tag.id}`, { method: 'DELETE' })
    if (editingId === tag.id) { setEditingId(null); setDraft(null) }
    await refresh()
  }

  // Up/down rather than drag: the list is flat and usually short, and arrows are
  // the version that works from a keyboard. Order decides how this list reads and
  // which badge wins when a product carries two badge tags.
  async function move(index: number, delta: number) {
    const next = [...tags]
    const target = index + delta
    if (target < 0 || target >= next.length) return
    const [row] = next.splice(index, 1)
    if (!row) return
    next.splice(target, 0, row)
    setTags(next)
    await fetch('/api/m/shop/admin/tags/reorder', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderedIds: next.map((t) => t.id) }),
    })
  }

  const set = <K extends keyof Draft>(key: K) => (value: Draft[K]) =>
    setDraft((d) => (d ? { ...d, [key]: value } : d))

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 className="page-title">Tags</h1>
          <p style={{ ...hintStyle, marginTop: '0.25rem' }}>
            Loose labels for products - a tag can have a page of its own and print a badge on the product card.
          </p>
        </div>
        <button onClick={createTag} className="btn btn-primary">New tag</button>
      </div>

      {loaded && tags.length === 0 && (
        <p style={{ ...hintStyle, marginTop: '1rem' }}>No tags yet. Make one and it will show up on the product editor&rsquo;s Organisation tab.</p>
      )}

      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '0.5rem' }}>
        {tags.map((tag, i) => {
          const editing = editingId === tag.id && draft
          return (
            <li key={tag.id} style={rowStyle}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', padding: '0.625rem 1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', minWidth: 0 }}>
                  <span style={{ fontWeight: 600 }}>{tag.name}</span>
                  <code style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>/{tag.slug}</code>
                  <span style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>
                    {tag.autoRule ? 'Applies itself' : tag.productCount === 1 ? '1 product' : `${tag.productCount} products`}
                  </span>
                  {!tag.storefrontVisible && (
                    <span style={{ fontSize: '0.6875rem', color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)', borderRadius: 4, padding: '1px 6px' }}>
                      Admin only
                    </span>
                  )}
                  {tag.badgeEnabled && (
                    <span style={{
                      fontSize: 11, fontWeight: 600, lineHeight: 1, padding: '4px 7px', borderRadius: 5,
                      background: tag.badgeBg || 'var(--color-surface)', color: tag.badgeText || 'var(--color-text-muted)',
                      border: tag.badgeBg ? 'none' : '1px solid var(--color-border)',
                    }}>{tag.badgeLabel || tag.name}</span>
                  )}
                </div>
                <span style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexShrink: 0 }}>
                  <button onClick={() => move(i, -1)} disabled={i === 0} style={{ ...linkButton, opacity: i === 0 ? 0.4 : 1 }} title="Move up" aria-label={`Move ${tag.name} up`}>↑</button>
                  <button onClick={() => move(i, 1)} disabled={i === tags.length - 1} style={{ ...linkButton, opacity: i === tags.length - 1 ? 0.4 : 1 }} title="Move down" aria-label={`Move ${tag.name} down`}>↓</button>
                  <button onClick={() => (editing ? (setEditingId(null), setDraft(null)) : startEdit(tag))} style={linkButton}>
                    {editing ? 'Close' : 'Edit'}
                  </button>
                  <button onClick={() => remove(tag)} style={{ ...linkButton, color: 'var(--color-danger)' }}>Delete</button>
                </span>
              </div>

              {editing && draft && (
                <div style={{ borderTop: '1px solid var(--color-border)', padding: '1rem', display: 'grid', gap: '1rem' }}>
                  {tag.autoRule === 'sale' && (
                    <p style={{ ...hintStyle, margin: 0 }}>
                      This one puts itself on products: anything with money off right now is in it, whether the discount sits on the product
                      or on one of its variations, and it drops out again the moment the offer ends. Rename it, recolour it or give it
                      different wording as you like - there is just nothing to tick on a product for it.
                    </p>
                  )}
                  <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
                    <div>
                      <label style={labelStyle} htmlFor={`tag-name-${tag.id}`}>Name</label>
                      <input id={`tag-name-${tag.id}`} style={inputStyle} value={draft.name} onChange={(e) => set('name')(e.target.value)} />
                    </div>
                    <div>
                      <label style={labelStyle} htmlFor={`tag-slug-${tag.id}`}>Web address</label>
                      <input id={`tag-slug-${tag.id}`} style={inputStyle} value={draft.slug} onChange={(e) => set('slug')(e.target.value)} />
                      <p style={hintStyle}>/shop/tag/{draft.slug.trim() || tag.slug}</p>
                    </div>
                  </div>

                  <div>
                    <label style={labelStyle} htmlFor={`tag-desc-${tag.id}`}>Description</label>
                    <textarea
                      id={`tag-desc-${tag.id}`} rows={2} style={{ ...inputStyle, resize: 'vertical' }}
                      value={draft.description} onChange={(e) => set('description')(e.target.value)}
                    />
                    <p style={hintStyle}>Printed at the top of the tag&rsquo;s own page, and used as its description in search results.</p>
                  </div>

                  <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', fontSize: '0.875rem' }}>
                    <input type="checkbox" checked={draft.storefrontVisible} onChange={(e) => set('storefrontVisible')(e.target.checked)} />
                    Show this tag on the shop
                  </label>
                  <p style={{ ...hintStyle, marginTop: '-0.75rem' }}>
                    Off keeps it for your own filing: no page, no badge, and nothing about it printed on the shop.
                  </p>

                  <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: '1rem', display: 'grid', gap: '0.75rem' }}>
                    <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', fontSize: '0.875rem', fontWeight: 600 }}>
                      <input type="checkbox" checked={draft.badgeEnabled} onChange={(e) => set('badgeEnabled')(e.target.checked)} />
                      Print a badge on the product card
                    </label>
                    {draft.badgeEnabled && (
                      <>
                        <div>
                          <label style={labelStyle} htmlFor={`tag-badge-label-${tag.id}`}>Badge wording</label>
                          <input
                            id={`tag-badge-label-${tag.id}`} style={inputStyle} placeholder={tag.name}
                            value={draft.badgeLabel} onChange={(e) => set('badgeLabel')(e.target.value)}
                          />
                          <p style={hintStyle}>Left blank, the badge says {tag.name}.</p>
                        </div>
                        <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
                          <div>
                            <label style={labelStyle}>Background - light mode</label>
                            <ColourPickerRow value={draft.badgeBg} onChange={set('badgeBg')} colours={colours} mode="light" placeholder="#0f766e" />
                          </div>
                          <div>
                            <label style={labelStyle}>Background - dark mode</label>
                            <ColourPickerRow value={draft.badgeBgDark} onChange={set('badgeBgDark')} colours={colours} mode="dark" placeholder="Same as light" />
                          </div>
                          <div>
                            <label style={labelStyle}>Wording - light mode</label>
                            <ColourPickerRow value={draft.badgeText} onChange={set('badgeText')} colours={colours} mode="light" placeholder="#ffffff" />
                          </div>
                          <div>
                            <label style={labelStyle}>Wording - dark mode</label>
                            <ColourPickerRow value={draft.badgeTextDark} onChange={set('badgeTextDark')} colours={colours} mode="dark" placeholder="Same as light" />
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'flex-start' }}>
                          <BadgePreview label={draft.badgeLabel || tag.name} bg={draft.badgeBg} text={draft.badgeText} caption="Light mode" />
                          <BadgePreview
                            label={draft.badgeLabel || tag.name}
                            bg={draft.badgeBgDark || draft.badgeBg}
                            text={draft.badgeTextDark || draft.badgeText}
                            caption="Dark mode"
                          />
                        </div>
                        <p style={hintStyle}>
                          One badge per card. Out of stock and pre-order still come first, and where a product carries two badge tags
                          the one higher up this list wins.
                        </p>
                      </>
                    )}
                  </div>

                  <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: '1rem', display: 'grid', gap: '0.75rem' }}>
                    <div>
                      <label style={labelStyle} htmlFor={`tag-meta-title-${tag.id}`}>Page title for search engines</label>
                      <input
                        id={`tag-meta-title-${tag.id}`} style={inputStyle} placeholder={tag.name}
                        value={draft.metaTitle} onChange={(e) => set('metaTitle')(e.target.value)}
                      />
                    </div>
                    <div>
                      <label style={labelStyle} htmlFor={`tag-meta-desc-${tag.id}`}>Description for search engines</label>
                      <input
                        id={`tag-meta-desc-${tag.id}`} style={inputStyle} placeholder="Falls back to the description above"
                        value={draft.metaDescription} onChange={(e) => set('metaDescription')(e.target.value)}
                      />
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                    <button className="btn btn-secondary" onClick={() => { setEditingId(null); setDraft(null) }}>Cancel</button>
                    <button className="btn btn-primary" disabled={saving} onClick={() => save(tag)}>{saving ? 'Saving…' : 'Save tag'}</button>
                  </div>
                </div>
              )}
            </li>
          )
        })}
      </ul>
      {confirmNode}
      {promptNode}
      {alertNode}
    </div>
  )
}
