// The two surfaces of the CLOSED gate (see getShopGate in lib/access.ts):
// what a shut-out visitor gets in place of the page, and the banner staff see
// on a page only they can reach.

export function ShopClosedNotice({ message }: { message: string }) {
  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '4rem 1.5rem', textAlign: 'center' }}>
      <p>{message}</p>
    </div>
  )
}

export function ShopStaffPreviewBanner() {
  return (
    <p
      style={{
        margin: '0 0 1.5rem',
        padding: '0.75rem 1rem',
        border: '1px solid var(--color-border)',
        borderRadius: 8,
        background: 'var(--color-bg-subtle)',
        color: 'var(--color-text)',
      }}
    >
      The shop is closed. Only signed-in staff can see this page - everyone else sees your closed message.
    </p>
  )
}
