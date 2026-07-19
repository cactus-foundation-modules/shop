import { resolveBreakpoints } from '@/lib/design/tokens'

// Client-safe half of the shop's breakpoint resolution.
//
// The Puck editor's preview components (parts/detail-parts, parts/card-parts)
// value-import DEFAULT_BREAKPOINTS, and those files are pulled into the page
// builder's client bundle through the generated module-components registry. It
// therefore cannot live beside getShopBreakpoints, which reaches prisma through
// lib/config/site: prisma attaches a client extension at module scope, which
// throws on load in a browser and takes the whole page builder down.
//
// Nothing here touches the database. ./breakpoints re-exports all of it, so
// every existing import keeps working unchanged.

export type Breakpoints = { tabletBp: string; mobileBp: string }

// Editor-canvas fallback: the sync Puck preview components can't await a config
// fetch, so they render at the platform default (still sourced from core's
// single DEFAULT_DESIGN_TOKENS, never a literal in this module).
export const DEFAULT_BREAKPOINTS: Breakpoints = resolveBreakpoints(undefined)
