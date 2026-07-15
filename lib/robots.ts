import { getShopConfigCached } from '@/modules/shop/lib/config'

// Scanned by scripts/generate-module-router.mjs (mirrors lib/sitemap.ts).
export async function getPublicRobotsDisallow(): Promise<string[]> {
  const config = await getShopConfigCached()
  return config.shopStatus === 'CLOSED' ? ['/shop'] : []
}
