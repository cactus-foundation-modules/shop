import { NextResponse } from 'next/server'
import { resolveCollectionIndexSources } from '@/modules/shop/lib/collection-index-sources'

// Probe used by the Collection Browser block's resolveFields, so the sidebar
// only offers "include X" for the sources this install actually has. Reveals
// nothing beyond which modules are installed - the same fact the public pages
// themselves reveal - so it needs no permission gate, exactly as search's own
// sources probe does not.

export async function GET() {
  const sources = await resolveCollectionIndexSources()
  return NextResponse.json({ sources: sources.map((s) => ({ id: s.id, label: s.label })) })
}
