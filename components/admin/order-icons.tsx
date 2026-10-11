// The order screen's icons. Same stroke family as the rest of the admin (see
// ICON_PROPS in components/admin/AdminNav.tsx) and the inbox's own set, so an
// order and a conversation open side by side wear the same marks. Every one is
// decorative: the tooltip and the hidden label beside it carry the meaning.

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

const dot = { fill: 'currentColor', stroke: 'none' }

export const BackIcon = <svg {...ICON}><path d="M15 5 8 12l7 7" /></svg>
export const BellIcon = <svg {...ICON}><path d="M6 9a6 6 0 0 1 12 0c0 4 1.5 5.5 1.5 5.5h-15S6 13 6 9Z" /><path d="M10 18a2 2 0 0 0 4 0" /></svg>
export const BanknoteIcon = <svg {...ICON}><rect x="3" y="6.5" width="18" height="11" rx="1.5" /><circle cx="12" cy="12" r="2.5" /><path d="M6.5 9.5v5" /><path d="M17.5 9.5v5" /></svg>
export const TruckIcon = <svg {...ICON}><path d="M3 6h11v9H3z" /><path d="M14 9h4l3 3.5V15h-7" /><circle cx="7" cy="17" r="1.7" /><circle cx="17" cy="17" r="1.7" /></svg>
export const MailIcon = <svg {...ICON}><path d="M3 6.5h18v11H3z" /><path d="m3 7 9 6 9-6" /></svg>
export const MoreIcon = <svg {...ICON}><circle cx="12" cy="5.5" r="1.4" {...dot} /><circle cx="12" cy="12" r="1.4" {...dot} /><circle cx="12" cy="18.5" r="1.4" {...dot} /></svg>
export const PenIcon = <svg {...ICON}><path d="M4 20h4l10-10a2.8 2.8 0 0 0-4-4L4 16z" /><path d="m13.5 6.5 4 4" /></svg>
export const CopyIcon = <svg {...ICON}><rect x="8.5" y="8.5" width="11" height="11" rx="1.5" /><path d="M15.5 8.5V6A1.5 1.5 0 0 0 14 4.5H6A1.5 1.5 0 0 0 4.5 6v8A1.5 1.5 0 0 0 6 15.5h2.5" /></svg>
export const TickIcon = <svg {...ICON}><path d="m5 12.5 4.5 4.5L19 7" /></svg>
export const CrossIcon = <svg {...ICON}><path d="m6 6 12 12" /><path d="m18 6-12 12" /></svg>
export const NewTabIcon = <svg {...ICON} width={13} height={13}><path d="M14 4h6v6" /><path d="M20 4 11 13" /><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" /></svg>
export const EyeIcon = <svg {...ICON}><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" /><circle cx="12" cy="12" r="2.8" /></svg>
export const DownloadIcon = <svg {...ICON}><path d="M12 4v11" /><path d="m7.5 10.5 4.5 4.5 4.5-4.5" /><path d="M5 19.5h14" /></svg>
export const ClockIcon = <svg {...ICON}><circle cx="12" cy="12" r="8" /><path d="M12 7.5V12l3 2" /></svg>
export const UndoIcon = <svg {...ICON}><path d="M9 14 4 9l5-5" /><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" /></svg>
export const BooksIcon = <svg {...ICON}><path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3" /><path d="M19.5 3.5V9H14" /></svg>
export const VoidIcon = <svg {...ICON}><circle cx="12" cy="12" r="8" /><path d="m6.5 17.5 11-11" /></svg>
export const ReceiptIcon = <svg {...ICON}><path d="M6 3.5h12v17l-3-2-3 2-3-2-3 2z" /><path d="M9 8.5h6" /><path d="M9 12h6" /></svg>
export const AlertIcon = <svg {...ICON}><path d="M12 4 3 19.5h18z" /><path d="M12 10v4" /><circle cx="12" cy="16.8" r="0.6" {...dot} /></svg>
export const HandIcon = <svg {...ICON}><path d="M8 12V6.5a1.5 1.5 0 0 1 3 0V11" /><path d="M11 10V4.5a1.5 1.5 0 0 1 3 0V11" /><path d="M14 10.5V6a1.5 1.5 0 0 1 3 0v7a6 6 0 0 1-6 6h-.5a5 5 0 0 1-4-2L4 13.5a1.5 1.5 0 0 1 2.5-1.5L8 13" /></svg>
export const CheckCircleIcon = <svg {...ICON}><circle cx="12" cy="12" r="8.5" /><path d="m8.5 12.3 2.4 2.4 4.6-5" /></svg>
