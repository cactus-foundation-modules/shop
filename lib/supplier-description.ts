// A per-supplier designed write-up, edited with the full-screen pop-out Puck
// builder (components/admin/description-builder) and rendered by the Shop:
// Supplier Description block. The same seam categories and collections have in
// lib/category-description.ts and lib/collection-description.ts, and for the same
// reasons: the layout type is one nothing registers blocks against, so the config
// is core's shared content parts only (headings, text, images, columns, callouts)
// with a bare root - no site header/footer/menu chrome.
//
// Its own tiny module rather than a constant on the editor: the storefront's RSC
// block needs it too, and must not pull a 'use client' file in to get it.
export const SUPPLIER_DESCRIPTION_LAYOUT_TYPE = 'shopSupplierDescription'
