'use client'

import { useEffect, useState } from 'react'

// Admin screens render client-side and don't otherwise load shop config, so they
// used to print bare amounts ("7.99") with no currency symbol. This hook hands
// them the configured symbol, fetched once and cached at module scope so every
// screen after the first gets it synchronously without another round-trip. Falls
// back to "£" until the fetch resolves (and if it ever fails).
let cached: string | null = null

export function useCurrencySymbol(): string {
  const [symbol, setSymbol] = useState<string>(cached ?? '£')

  useEffect(() => {
    if (cached !== null) return
    let active = true
    fetch('/api/m/shop/public/config')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        const next: string | undefined = data?.currencySymbol
        if (!next) return
        cached = next
        if (active) setSymbol(next)
      })
      .catch(() => {})
    return () => { active = false }
  }, [])

  return symbol
}
