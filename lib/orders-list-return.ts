import { useSyncExternalStore } from 'react'

// Remembers which orders list the owner was looking at - its filters, sort and
// page, as the query string the list keeps in the address bar - so the back
// arrow on an order goes to that list rather than the unfiltered one. Per tab
// (sessionStorage): two tabs on two different filters each go back to their own.
//
// Every access is guarded: storage can be switched off or full, and a lost
// filter is a nuisance, never a reason for the page to fall over.

const KEY = 'shop:orders-list-query'

export function rememberOrdersListQuery(query: string): void {
  try {
    if (query) window.sessionStorage.setItem(KEY, query)
    else window.sessionStorage.removeItem(KEY)
  } catch {
    // Storage unavailable - the back arrow falls back to the plain list.
  }
}

export function readOrdersListQuery(): string {
  try {
    return window.sessionStorage.getItem(KEY) ?? ''
  } catch {
    return ''
  }
}

// Nothing in this tab changes the remembered list while an order is open, so
// there is nothing to subscribe to; useSyncExternalStore is here for its server
// snapshot, which keeps the server's markup and the first client render the
// same and then swaps in the remembered query straight after.
const noSubscription = () => () => {}

export function useOrdersListQuery(): string {
  return useSyncExternalStore(noSubscription, readOrdersListQuery, () => '')
}
