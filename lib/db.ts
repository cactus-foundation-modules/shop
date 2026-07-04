// Barrel re-export - keeps `import { x } from '@/modules/shop/lib/db'` working
// (Gazette/Directory convention) while the implementation is split by entity
// under lib/db/* given the module's table count (30 tables vs. their ~10).
export * from '@/modules/shop/lib/db/products'
export * from '@/modules/shop/lib/db/catalogue'
export * from '@/modules/shop/lib/db/orders'
export * from '@/modules/shop/lib/db/refunds'
export * from '@/modules/shop/lib/db/tax-shipping'
export * from '@/modules/shop/lib/db/discounts'
export * from '@/modules/shop/lib/db/reviews'
export * from '@/modules/shop/lib/db/addresses'
export * from '@/modules/shop/lib/db/back-in-stock'
export * from '@/modules/shop/lib/db/digital'
export * from '@/modules/shop/lib/db/import-jobs'
export * from '@/modules/shop/lib/db/recommendations'
export * from '@/modules/shop/lib/db/page-layouts'
export * from '@/modules/shop/lib/db/email-templates'
