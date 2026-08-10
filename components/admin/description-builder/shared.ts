import type { PuckData } from '@/modules/shop/lib/types'

// The bits of the description builder that its hosts need without pulling the
// builder itself in: a server page needs the chrome-stripping CSS, and the
// product editor needs the empty document to seed a description with. Neither
// should drag Puck into its own bundle to get them, so they live here rather
// than in the 'use client' builder.

// The full-screen description builder lives under the admin path (so the session
// gate and rewrites apply) but wants none of the admin shell around it. Each page
// that hosts the builder drops this in a <style> tag to strip the chrome, leaving
// nothing but the page builder.
export const DESCRIPTION_BUILDER_CHROME_OFF_CSS = `
.admin-shell{height:100vh;overflow:hidden;--radius-lg:var(--admin-radius-lg)}
.admin-sidebar,.admin-mobile-topbar{display:none!important}
.admin-content{padding:0!important;overflow:hidden;display:flex;flex-direction:column;min-height:0}
.spe-desc-standalone{display:flex;flex-direction:column;height:100vh;min-height:0;background:var(--color-bg)}
.spe-desc-standalone-bar{display:flex;align-items:center;gap:var(--space-4);padding:var(--space-3) var(--space-4);border-bottom:1px solid var(--color-border);background:var(--color-surface);flex-shrink:0}
.spe-desc-standalone-title{display:flex;flex-direction:column;line-height:1.2;min-width:0}
.spe-desc-standalone-title strong{color:var(--color-text);font-size:0.95rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.spe-desc-standalone-eyebrow{color:var(--color-text-secondary);font-size:0.7rem;text-transform:uppercase;letter-spacing:0.04em}
.spe-desc-standalone-status{margin-left:auto;color:var(--color-text-secondary);font-size:0.85rem;text-align:right}
.spe-desc-standalone-status--error{color:var(--color-danger)}
.spe-desc-standalone-canvas{flex:1;min-height:0;overflow:hidden;position:relative}
.spe-desc-standalone-canvas .Puck{height:100%}
`

// Puck's minimal empty document. Seeded when an admin first chooses to design.
export const emptyDescriptionPuck: PuckData = { content: [], root: {} }
