'use client'

import { useCallback, useEffect, useState } from 'react'

/**
 * Keep an admin screen's open tab in the URL.
 *
 * Tabs held only in React state look fine until the page is refreshed, bookmarked
 * or shared, all of which used to drop the admin back on the first tab. Writing
 * the choice into the query string fixes that without changing how the tab strips
 * themselves work.
 *
 * replaceState rather than a router navigation: this is bookkeeping about where
 * you already are, so the back button should leave the screen rather than walk
 * back through every tab that got poked at, and a router call would re-run the
 * server page for a view the client is already showing. The product editor has
 * done it this way since long before this file existed.
 *
 * A `null` value removes the key, which is how a default tab keeps the URL tidy.
 */
export function setTabParams(params: Record<string, string | null>) {
  if (typeof window === 'undefined') return
  const url = new URL(window.location.href)
  for (const [key, value] of Object.entries(params)) {
    if (value === null) url.searchParams.delete(key)
    else url.searchParams.set(key, value)
  }
  if (url.href !== window.location.href) window.history.replaceState(null, '', url)
}

/** The tab named in the URL, if any. Call it from a mount effect, not during a
 *  render: these screens are server-rendered first, and reading the location
 *  while rendering would have the two disagree. */
export function readTabParam(key: string): string | null {
  if (typeof window === 'undefined') return null
  return new URLSearchParams(window.location.search).get(key)
}


/**
 * Tab state that survives a refresh.
 *
 * A tab held only in React state looks fine until the page is refreshed,
 * bookmarked or shared, all of which used to drop the admin back on the first
 * tab. This keeps the choice in the query string instead.
 *
 * The URL is read once on mount rather than during a render, because these
 * screens are server-rendered first and reading the location mid-render would
 * have the two disagree. Writing uses replaceState rather than a router
 * navigation: it is bookkeeping about where you already are, so the back button
 * should leave the screen rather than walk back through every tab that got poked
 * at, and a router call would re-run the server page for a view the client is
 * already showing. The default tab carries no param, to keep the URL tidy.
 */
export function useTabParam<T extends string>(key: string, fallback: T, valid: readonly T[]) {
  const [tab, setTab] = useState<T>(fallback)

  useEffect(() => {
    const wanted = new URLSearchParams(window.location.search).get(key)
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot read of the URL's tab on mount
    if (wanted && (valid as readonly string[]).includes(wanted)) setTab(wanted as T)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount only; the tab list is fixed for the screen
  }, [])

  const selectTab = useCallback((next: T) => {
    setTab(next)
    const url = new URL(window.location.href)
    if (next === fallback) url.searchParams.delete(key)
    else url.searchParams.set(key, next)
    if (url.href !== window.location.href) window.history.replaceState(null, '', url)
  }, [key, fallback])

  return [tab, selectTab] as const
}
