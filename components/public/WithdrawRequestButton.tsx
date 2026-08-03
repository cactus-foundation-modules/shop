'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

// Letting a customer take a request back. Only ever offered on a PENDING one -
// the API checks the same thing, since a button is not a permission.

export default function WithdrawRequestButton({ requestId }: { requestId: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function withdraw() {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/m/shop/member/requests/${requestId}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error ?? 'That did not go through. Try again in a moment.')
        return
      }
      router.refresh()
    } catch {
      setError('That did not go through. Try again in a moment.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <button type="button" className="btn btn-sm" onClick={withdraw} disabled={busy}>
        {busy ? 'Withdrawing…' : 'Withdraw this request'}
      </button>
      {error && <p style={{ color: 'var(--color-error)', margin: '0.375rem 0 0', fontSize: 'var(--text-sm)' }}>{error}</p>}
    </>
  )
}
