// A per-category designed description, edited with the full-screen pop-out Puck
// builder (components/admin/description-builder) and rendered by the Shop:
// Category Description block. Like its product twin, the layout type is
// deliberately one nothing registers blocks against, so the config is core's
// shared content parts only (headings, text, images, columns, callouts) with a
// bare root - no site header/footer/menu chrome. The same shared parts drive the
// storefront render, so editor and frontend markup match automatically.
//
// Its own tiny module rather than a constant on the editor: the storefront's RSC
// block needs it too, and must not pull a 'use client' file in to get it.
export const CATEGORY_DESCRIPTION_LAYOUT_TYPE = 'shopCategoryDescription'
