import { normalizeResponsiveValue, pickResponsive, mobileMediaQuery, tabletMediaQuery, type Device, type ResponsiveValue } from '@/lib/puck/responsiveValue'

// The sticky category filter bar above a product grid. Emitted by the storefront
// grid and the editor canvas, so it lives in a dependency-free file of its own
// like section-head-css.ts.
//
// Sticky only works inside its parent, so the bar and the grid share one wrapper:
// the bar rides along for exactly as long as the shelf under it is on screen and
// lets go when the shelf ends. `--shop-catbar-top` is the gap to leave for a
// fixed site header, set per block from the "Stick below the top by" field.
export const SHOP_CATEGORY_BAR_CSS = `
.shop-catbar-wrap{position:relative}
.shop-catbar{position:sticky;top:var(--shop-catbar-top,0px);z-index:20;display:flex;gap:10px;padding:12px 0;margin:0 0 12px;background:var(--color-bg);border-bottom:1px solid var(--color-border);overflow-x:auto;scrollbar-width:none;-webkit-overflow-scrolling:touch}
.shop-catbar::-webkit-scrollbar{display:none}
.shop-catbar-pill{flex:none;font:inherit;font-size:15px;font-weight:500;line-height:1;padding:12px 20px;border:2px solid var(--color-border);border-radius:999px;background:var(--color-surface);color:var(--color-fg);cursor:pointer;white-space:nowrap;transition:background .2s ease,border-color .2s ease,color .2s ease}
.shop-catbar-pill:hover{border-color:var(--color-border-strong)}
.shop-catbar-pill[aria-pressed="true"]{background:var(--color-primary);border-color:var(--color-primary);color:var(--color-on-primary)}
.shop-catbar-pill:focus-visible{outline:2px solid var(--color-border-focus);outline-offset:2px}
.shop-catbar-body{transition:opacity .15s ease}
.shop-catbar-body[aria-busy="true"]{opacity:.55}
@media (prefers-reduced-motion:reduce){.shop-catbar-pill,.shop-catbar-body{transition:none}}
`

export type CategoryBarSetting = ResponsiveValue<string> | string | undefined

const DEVICE_LIST: Device[] = ['desktop', 'tablet', 'mobile']

/** Whether the bar is on, per device. Tablet inherits desktop and mobile inherits
 *  tablet, like every responsive field. A plain 'yes' (what the field held before
 *  it went per-device) is on everywhere, exactly as it was. */
export function categoryBarDevices(setting: CategoryBarSetting): Record<Device, boolean> {
  const rv = normalizeResponsiveValue<string>(setting)
  const on = (d: Device) => pickResponsive(rv, d) === 'yes'
  return { desktop: on('desktop'), tablet: on('tablet'), mobile: on('mobile') }
}

/** CSS that hides the pills on the devices switched off. Scoped to one block by
 *  its data-catbar-id so two grids can differ. The grid underneath is never
 *  touched - only the pill row goes. Empty when the bar is on everywhere. */
export function categoryBarVisibilityCss(id: string | undefined, flags: Record<Device, boolean>): string {
  if (!id || DEVICE_LIST.every((d) => flags[d])) return ''
  const sel = `[data-catbar-id="${id.replace(/[^A-Za-z0-9_-]/g, '')}"] .shop-catbar`
  const rule = (on: boolean) => (on ? 'display:flex' : 'display:none')
  const out = [`${sel}{${rule(flags.desktop)}}`]
  if (flags.tablet !== flags.desktop) out.push(`${tabletMediaQuery()}{${sel}{${rule(flags.tablet)}}}`)
  if (flags.mobile !== flags.desktop) out.push(`${mobileMediaQuery()}{${sel}{${rule(flags.mobile)}}}`)
  return out.join('\n')
}
