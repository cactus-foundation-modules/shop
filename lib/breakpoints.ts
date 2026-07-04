import { getSiteConfig } from '@/lib/config/site'
import { resolveBreakpoints } from '@/lib/design/tokens'

// The shop's responsive grids collapse at the site's own Styles > Spacing &
// Breakpoints widths (same source as core Grid/Split blocks) rather than
// bespoke hardcoded pixels. Media queries can't read CSS custom properties, so
// the resolved width has to be baked into each block's <style> at render time.
export type Breakpoints = { tabletBp: string; mobileBp: string }

// Editor-canvas fallback: the sync Puck preview components can't await a config
// fetch, so they render at the platform default (still sourced from core's
// single DEFAULT_DESIGN_TOKENS, never a literal in this module).
export const DEFAULT_BREAKPOINTS: Breakpoints = resolveBreakpoints(undefined)

// RSC/server path: resolve the live site setting.
export async function getShopBreakpoints(): Promise<Breakpoints> {
  const config = await getSiteConfig()
  return resolveBreakpoints(config?.designTokens)
}
