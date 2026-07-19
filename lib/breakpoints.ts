import { getSiteConfig } from '@/lib/config/site'
import { resolveBreakpoints } from '@/lib/design/tokens'
import type { Breakpoints } from '@/modules/shop/lib/breakpoints-shared'

// The shop's responsive grids collapse at the site's own Styles > Spacing &
// Breakpoints widths (same source as core Grid/Split blocks) rather than
// bespoke hardcoded pixels. Media queries can't read CSS custom properties, so
// the resolved width has to be baked into each block's <style> at render time.
//
// The type and the editor-canvas default live in ./breakpoints-shared, which
// touches no database, so the Puck preview components can import them without
// dragging prisma into the page builder's client bundle. Re-exported here so
// every server-side import of this file keeps working exactly as before.
export { DEFAULT_BREAKPOINTS, type Breakpoints } from '@/modules/shop/lib/breakpoints-shared'

// RSC/server path: resolve the live site setting.
export async function getShopBreakpoints(): Promise<Breakpoints> {
  const config = await getSiteConfig()
  return resolveBreakpoints(config?.designTokens)
}
