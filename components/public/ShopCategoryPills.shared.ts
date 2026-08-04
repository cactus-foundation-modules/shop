// The pill strip's stylesheet, in a file with no server imports so both halves
// of the Category Browser block can use it: the RSC render (ShopCategoryPills)
// and the client editor placeholder (ShopCategoryBrowser.tsx) stamp the same
// classes, keeping the editor canvas pixel-identical to the live page.
//
// Tokens only - the pills pick up each site's palette and stay AA in both
// light and dark mode because the text/background pairing is the page's own.
export const shopCategoryPillsCss = `
.shop-cat-pills {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}
.shop-cat-pill {
  display: inline-flex;
  align-items: center;
  padding: 0.4rem 0.95rem;
  border: 1px solid var(--color-border);
  border-radius: 999px;
  background: var(--color-surface);
  color: var(--color-text);
  font-size: 0.875rem;
  line-height: 1.3;
  text-decoration: none;
  transition: background 0.15s ease, border-color 0.15s ease;
}
.shop-cat-pill:hover {
  background: var(--color-bg-subtle);
  border-color: var(--color-text-muted);
}
`
