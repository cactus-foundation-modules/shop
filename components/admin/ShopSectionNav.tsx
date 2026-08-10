'use client'

import { useAdminPath } from '@/components/admin/AdminPathContext'
import { TabStrip } from '@/components/admin/TabStrip'
import type { ShopNavTab } from '@/modules/shop/lib/admin-nav'

// The one tab strip every shop admin screen wears. Which tabs it holds is worked
// out on the server (see lib/admin-nav), so this only has to turn them into
// links and mark the current one.
export function ShopSectionNav({ tabs, active }: { tabs: ShopNavTab[]; active: string }) {
  const adminPath = useAdminPath()

  if (tabs.length < 2) return null

  return (
    <TabStrip
      style={{ marginBottom: '1.5rem' }}
      items={tabs.map((tab) => ({
        key: tab.key,
        label: tab.label,
        href: `/${adminPath}${tab.path}`,
        active: tab.key === active,
      }))}
    />
  )
}
