'use client'

import { createContext, useContext, useEffect, useId, useMemo, useRef, type ReactNode } from 'react'

/**
 * The product editor's contract with the tabs hung off it.
 *
 * Modules contributing a tab through `shop.product-editor-sections` do not have
 * to grow their own save button: they call {@link useProductEditorSave} and the
 * editor's single Save button saves them alongside the product's own fields,
 * marks their tab when they have unsaved work, and guards navigation away.
 *
 * A tab that only performs structural actions (adding an option, generating a
 * matrix) needs none of this - those apply immediately and there is nothing to
 * hold back.
 */

export type ProductEditorSaver = {
  /** True while this tab is holding edits the Save button has not written yet. */
  dirty: boolean
  /** Persist this tab's edits. Throw an Error to fail the save; its message is shown to the admin. */
  save: () => Promise<void>
}

type Registration = ProductEditorSaver & { tabId: string; tabLabel: string }

type Registry = {
  register: (key: string, registration: Registration) => void
  unregister: (key: string) => void
  setBadge: (tabId: string, badge: string | null) => void
  currency: string
}

const RegistryContext = createContext<Registry | null>(null)
const TabScopeContext = createContext<{ tabId: string; tabLabel: string } | null>(null)

export function ProductEditorRegistryProvider({ value, children }: { value: Registry; children: ReactNode }) {
  return <RegistryContext.Provider value={value}>{children}</RegistryContext.Provider>
}

/** Wraps one tab's panel so anything inside it registers against that tab without naming it. */
export function ProductEditorTabScope({ tabId, tabLabel, children }: { tabId: string; tabLabel: string; children: ReactNode }) {
  const scope = useMemo(() => ({ tabId, tabLabel }), [tabId, tabLabel])
  return <TabScopeContext.Provider value={scope}>{children}</TabScopeContext.Provider>
}

/**
 * Hands this tab's unsaved edits to the editor's Save button.
 *
 * Call it unconditionally from a client component inside a product editor tab.
 * Outside the product editor it is inert, so a component can be shared between
 * the tab and a standalone screen without branching.
 */
export function useProductEditorSave({ dirty, save }: ProductEditorSaver) {
  const registry = useContext(RegistryContext)
  const scope = useContext(TabScopeContext)
  const key = useId()

  // The save closure changes on every keystroke; keeping it in a ref means the
  // registration only churns when the dirty flag actually flips.
  const saveRef = useRef(save)
  useEffect(() => { saveRef.current = save })

  useEffect(() => {
    if (!registry || !scope) return
    registry.register(key, {
      tabId: scope.tabId,
      tabLabel: scope.tabLabel,
      dirty,
      save: () => saveRef.current(),
    })
    return () => registry.unregister(key)
  }, [registry, scope, key, dirty])
}

/**
 * Shows a short count on this tab's label, e.g. "12" next to Variations, so the
 * admin can see what a tab holds without opening it. Pass null to clear it.
 */
export function useProductEditorTabBadge(badge: string | null) {
  const registry = useContext(RegistryContext)
  const scope = useContext(TabScopeContext)
  const tabId = scope?.tabId

  useEffect(() => {
    if (!registry || !tabId) return
    registry.setBadge(tabId, badge)
    return () => registry.setBadge(tabId, null)
  }, [registry, tabId, badge])
}

/**
 * The shop's configured currency symbol, already loaded by the editor. Saves a
 * contributed tab fetching the shop config again for the sake of a "£".
 */
export function useProductEditorCurrency(): string {
  return useContext(RegistryContext)?.currency ?? '£'
}

export type { Registry as ProductEditorRegistry, Registration as ProductEditorRegistration }
