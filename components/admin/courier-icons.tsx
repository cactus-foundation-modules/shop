// The Couriers screen's icons, in the admin's stroke family (see order-icons.tsx).
// Decorative: every button carrying one has its own aria-label.

const ICON = {
  width: 16,
  height: 16,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
}

export const SaveIcon = <svg {...ICON}><path d="M5 4h11l3 3v12a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1z" /><path d="M8 4v5h7V4" /><rect x="8" y="13" width="8" height="5" rx="0.5" /></svg>
export const ChevronDownIcon = <svg {...ICON}><path d="m6 9 6 6 6-6" /></svg>
export const ArrowUpIcon = <svg {...ICON}><path d="M12 19V5" /><path d="m6 11 6-6 6 6" /></svg>
export const ArrowDownIcon = <svg {...ICON}><path d="M12 5v14" /><path d="m6 13 6 6 6-6" /></svg>
export const TrashIcon = <svg {...ICON}><path d="M4.5 7h15" /><path d="M9.5 7V4.5h5V7" /><path d="M6.5 7l1 12.5h9l1-12.5" /></svg>
