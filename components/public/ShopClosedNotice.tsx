// The two surfaces of the CLOSED gate (see getShopGate in lib/access.ts):
// what a shut-out visitor gets in place of the page, and the banner staff see
// on a page only they can reach. The out-of-stock gate borrows the second one
// (see lib/stock-visibility.ts), for the same reason: staff standing on a page
// nobody else can reach should be told so, rather than left to assume the shop
// is showing it to everybody.

export function ShopClosedNotice({ message }: { message: string }) {
  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '4rem 1.5rem', textAlign: 'center' }}>
      <p>{message}</p>
    </div>
  )
}

const bannerStyle: React.CSSProperties = {
  margin: '0 0 1.5rem',
  padding: '0.75rem 1rem',
  border: '1px solid var(--color-border)',
  borderRadius: 8,
  background: 'var(--color-bg-subtle)',
  color: 'var(--color-text)',
}

export function ShopStaffPreviewBanner() {
  return (
    <p style={bannerStyle}>
      The shop is closed. Only signed-in staff can see this page - everyone else sees your closed message.
    </p>
  )
}

export function ShopStockHiddenBanner() {
  return (
    <p style={bannerStyle}>
      This product is out of stock, and your shop is set to hide those. Only signed-in staff can see this page -
      everyone else gets a page-not-found. It comes back on its own once there is stock again.
    </p>
  )
}
