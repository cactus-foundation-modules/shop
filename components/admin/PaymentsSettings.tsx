'use client'

// The Payments tab of Settings → Shop.
//
// Two levels: a strip of chips across the top, and one panel below it. The first
// chip ("Payment methods") is the list of everything this site can take money
// with - switch each one on or off, and drag them into the order shoppers meet
// them at checkout. Every method after that gets a chip of its own holding only
// its own settings, so nobody has to scroll past PayPal's four boxes to reach
// the bank details.
//
// Methods contributed by other modules (Instant Bank Pay, Square, Crezco…)
// appear in the list beside shop's own four and get their chip from the panel
// they publish into the shop.payments slot. Shop names none of them: the list
// comes from the settings API, the panels from the manifest.
import { useEffect, useRef, useState, type CSSProperties } from 'react'
import type { HostedSettingsPanel } from '@/lib/modules/hosted-settings'
import type { ShpConfig } from '@/modules/shop/lib/config'
import {
  isPaymentMethodSwitchedOn,
  resolvePaymentMethodOrder,
  sortPaymentMethods,
  type ShpAdminPaymentMethod,
} from '@/modules/shop/lib/payments/admin-methods'
import type { ShpPaymentLogo } from '@/modules/shop/lib/payments/provider'

export const PAYMENT_METHODS_TAB = 'methods'

/** True when the payments chip showing is another module's panel, which saves itself. */
export function isHostedPaymentPanelTab(tab: string): boolean {
  return tab.startsWith('panel:')
}

type ProviderKeyField = { key: string; label: string; type: 'text' | 'password' | 'select'; options?: string[]; hint?: string }

type BuiltInMethodMeta = {
  /** What the method does, in the shopper's terms rather than the developer's. */
  blurb: string
  /** Who you actually have an account with, for the credentials heading. */
  shortName?: string
  /** Credential boxes, for the two built-ins that have any. */
  keys?: ProviderKeyField[]
  keysIntro?: string
  /**
   * The subset of those the method genuinely cannot work without - the same
   * ones `lib/env.ts` checks. With all of them stored but the method still not
   * ready, the answer is "not deployed yet", not "you have missed a box", and
   * the panel should say so rather than nag for something already typed in.
   */
  requiredKeys?: string[]
  /** Path of the callback the provider posts to, shown for copying. */
  webhookPath?: string
  webhookHint?: string
  /** The config key holding the words shown to a shopper who picks this method. */
  instructionsKey?: 'bankTransferInstructions' | 'cashInstructions'
  instructionsLabel?: string
  instructionsHint?: string
  /**
   * The switch deciding whether those words also appear on the checkout page
   * itself, rather than only once the order is placed. Kept beside the box it
   * governs, since it is a question about that wording and nothing else.
   */
  instructionsOnCheckoutKey?: 'bankTransferInstructionsOnCheckout' | 'cashInstructionsOnCheckout'
  instructionsOnCheckoutLabel?: string
  instructionsOnCheckoutHint?: string
  /** Said plainly because these two are settled by hand, long after checkout. */
  manualNote?: string
}

const BUILT_IN_META: Record<string, BuiltInMethodMeta> = {
  STRIPE: {
    shortName: 'Stripe',
    blurb: 'Cards and the phone wallets, taken on your own checkout page. Card numbers go straight to Stripe and never touch your site.',
    keysIntro: 'From your Stripe dashboard, under Developers → API keys. Saving stores them for the next deployment of your site rather than this instant.',
    requiredKeys: ['STRIPE_PUBLISHABLE_KEY', 'STRIPE_SECRET_KEY'],
    keys: [
      { key: 'STRIPE_PUBLISHABLE_KEY', label: 'Publishable key', type: 'text', hint: 'Begins pk_. This one is meant to be seen by shoppers.' },
      { key: 'STRIPE_SECRET_KEY', label: 'Secret key', type: 'password', hint: 'Begins sk_. This one is not - keep it to yourself.' },
      { key: 'STRIPE_WEBHOOK_SECRET', label: 'Webhook signing secret', type: 'password', hint: 'Begins whsec_. Stripe shows it once you have added the address below.' },
    ],
    webhookPath: '/api/m/shop/webhooks/stripe',
    webhookHint: 'Add this in Stripe under Developers → Webhooks. Without it, payments and refunds still work but have to be confirmed by hand.',
  },
  PAYPAL: {
    shortName: 'PayPal',
    blurb: 'Sends the shopper over to PayPal to pay and brings them back afterwards. Worth having for anyone who would rather not type a card number.',
    keysIntro: 'From developer.paypal.com, under Apps & Credentials. Sandbox is for testing with pretend money; switch to Live when you are ready for the real thing.',
    requiredKeys: ['PAYPAL_CLIENT_ID', 'PAYPAL_CLIENT_SECRET'],
    keys: [
      { key: 'PAYPAL_CLIENT_ID', label: 'Client ID', type: 'text' },
      { key: 'PAYPAL_CLIENT_SECRET', label: 'Client secret', type: 'password', hint: 'Keep this one to yourself.' },
      { key: 'PAYPAL_WEBHOOK_ID', label: 'Webhook ID', type: 'text', hint: 'PayPal gives you this when you add the address below to your app.' },
      { key: 'PAYPAL_MODE', label: 'Mode', type: 'select', options: ['sandbox', 'live'], hint: 'Sandbox takes pretend money. Live takes real money.' },
    ],
    webhookPath: '/api/m/shop/webhooks/paypal',
    webhookHint: 'Add this as a webhook on your PayPal app so payments are confirmed without you watching for them.',
  },
  BANK_TRANSFER: {
    blurb: 'The shopper is given your bank details and sends the money themselves. Nothing is taken automatically, so the order sits and waits until you say it has landed.',
    instructionsKey: 'bankTransferInstructions',
    instructionsLabel: 'What to tell the shopper',
    instructionsHint: 'Shown on the thank-you page once the order is placed. Account name, sort code and account number, and ask them to quote the order number as the reference.',
    instructionsOnCheckoutKey: 'bankTransferInstructionsOnCheckout',
    instructionsOnCheckoutLabel: 'Show this on the checkout page too',
    instructionsOnCheckoutHint: 'On, and the shopper sees your bank details the moment they pick this method. Off, and they wait until the order is placed - the thank-you page and their order page still show them either way.',
    manualNote: 'Orders paid this way arrive marked awaiting payment. Open the order and press Confirm payment once the money is in.',
  },
  CASH: {
    blurb: 'Paying on collection or on the doorstep. Same arrangement as a bank transfer: the order waits until you mark it paid.',
    instructionsKey: 'cashInstructions',
    instructionsLabel: 'What to tell the shopper',
    instructionsHint: 'Where to come, when you are open, and whether you can take a card on the day. Shown on the thank-you page once the order is placed.',
    instructionsOnCheckoutKey: 'cashInstructionsOnCheckout',
    instructionsOnCheckoutLabel: 'Show this on the checkout page too',
    instructionsOnCheckoutHint: 'On, and the collection details appear the moment the shopper picks this method. Off, and they wait until the order is placed - the thank-you page and their order page still show them either way.',
    manualNote: 'Orders paid this way arrive marked awaiting payment. Open the order and press Confirm payment once you have the money.',
  },
}

// Which credentials belong to which method, for the one Save button each panel
// has. Only the two built-ins with keys appear here.
const CREDENTIAL_METHODS = ['STRIPE', 'PAYPAL'] as const

const hr: CSSProperties = { border: 'none', borderTop: '1px solid var(--color-border)', margin: '1.5rem 0' }
const sectionHeading: CSSProperties = { margin: '0 0 0.5rem', fontSize: '1rem', fontWeight: 600 }
const mutedText: CSSProperties = { color: 'var(--color-text-secondary)', fontSize: 'var(--text-sm)', margin: 0 }

const chipStyle = (active: boolean): CSSProperties => ({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '0.4rem',
  padding: '0.375rem 0.8rem',
  borderRadius: '999px',
  border: `1px solid ${active ? 'var(--color-primary)' : 'var(--color-border)'}`,
  background: active ? 'var(--color-primary-subtle)' : 'var(--color-surface)',
  color: active ? 'var(--color-primary-dark)' : 'var(--color-text-secondary)',
  fontWeight: active ? 600 : 400,
  fontSize: 'var(--text-sm)',
  fontFamily: 'inherit',
  whiteSpace: 'nowrap',
  cursor: 'pointer',
})

type MethodState = 'live' | 'unfinished' | 'off'

function methodState(method: ShpAdminPaymentMethod, config: ShpConfig): MethodState {
  if (!isPaymentMethodSwitchedOn(method, config)) return 'off'
  return method.ready ? 'live' : 'unfinished'
}

const STATE_DOT: Record<MethodState, string> = {
  live: 'var(--color-success)',
  unfinished: 'var(--color-warning)',
  off: 'var(--color-border-strong)',
}

function StatusBadge({ state }: { state: MethodState }) {
  if (state === 'live') return <span className="badge badge-success">Showing at checkout</span>
  if (state === 'unfinished') return <span className="badge badge-warning">Not finished</span>
  return <span className="badge badge-default">Off</span>
}

/** On/off control. A word beside it, because a lone coloured slider is a guess. */
function Switch({ checked, onChange, label }: { checked: boolean; onChange: (next: boolean) => void; label: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        style={{
          position: 'relative',
          width: '2.5rem',
          height: '1.375rem',
          flexShrink: 0,
          padding: 0,
          borderRadius: '999px',
          border: `1px solid ${checked ? 'var(--color-primary)' : 'var(--color-border-strong)'}`,
          background: checked ? 'var(--color-primary)' : 'var(--color-border)',
          cursor: 'pointer',
          transition: 'background 0.15s ease, border-color 0.15s ease',
        }}
      >
        <span
          aria-hidden
          style={{
            position: 'absolute',
            top: '50%',
            left: checked ? 'calc(100% - 1.125rem)' : '0.125rem',
            width: '1rem',
            height: '1rem',
            borderRadius: '50%',
            background: 'var(--color-surface)',
            transform: 'translateY(-50%)',
            transition: 'left 0.15s ease',
          }}
        />
      </button>
      <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)', minWidth: '1.75rem' }}>
        {checked ? 'On' : 'Off'}
      </span>
    </span>
  )
}

// The method's mark at the size the checkout draws it, so the switch beside it
// is showing the owner the actual thing rather than a description of it. Both
// colourways are rendered where the provider ships two and core's logo-swap CSS
// hides the wrong one - which is why `display` is left out of the style here,
// exactly as at checkout.
const ADMIN_LOGO_HEIGHT = 20

function MethodLogo({ logo }: { logo: ShpPaymentLogo }) {
  const width = logo.height > 0 ? Math.round((logo.width / logo.height) * ADMIN_LOGO_HEIGHT) : ADMIN_LOGO_HEIGHT
  const style = { height: ADMIN_LOGO_HEIGHT, width: 'auto', flex: '0 0 auto' } as const
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element -- data: URI shipped by the payment provider itself, nothing for the image optimiser to fetch */}
      <img src={logo.light} alt="" width={width} height={ADMIN_LOGO_HEIGHT} style={style} data-logo-variant={logo.dark ? 'light' : undefined} />
      {logo.dark && (
        // eslint-disable-next-line @next/next/no-img-element -- as above
        <img src={logo.dark} alt="" width={width} height={ADMIN_LOGO_HEIGHT} style={style} data-logo-variant="dark" />
      )}
    </>
  )
}

/** A read-only address for pasting into somebody else's dashboard. */
function WebhookAddress({ path, hint }: { path: string; hint: string }) {
  const [url, setUrl] = useState(path)

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- window.location only exists post-mount; using it during render would break hydration
    setUrl(`${window.location.origin}${path}`)
  }, [path])

  return (
    <div className="field" style={{ marginBottom: 0 }}>
      <label htmlFor={`shp-webhook-${path}`}>Address to give them</label>
      <p className="field-hint" style={{ marginTop: 0, marginBottom: '0.375rem' }}>{hint}</p>
      <input id={`shp-webhook-${path}`} type="text" value={url} readOnly onFocus={(e) => e.target.select()} />
    </div>
  )
}

type Props = {
  config: ShpConfig
  set: <K extends keyof ShpConfig>(key: K, value: ShpConfig[K]) => void
  /** Every registered method, from the settings API. Null while it is still coming. */
  methods: ShpAdminPaymentMethod[] | null
  /** Panels other modules publish into the shop.payments slot, each already labelled. */
  hostedPanels: HostedSettingsPanel[]
  activeTab: string
  onTabChange: (tab: string) => void
}

export function PaymentsSettings({ config, set, methods, hostedPanels, activeTab, onTabChange }: Props) {
  const [envAdminAllowed, setEnvAdminAllowed] = useState<boolean | null>(null)
  const [envKeyStatus, setEnvKeyStatus] = useState<Record<string, boolean>>({})
  const [envFields, setEnvFields] = useState<Record<string, string>>({})
  const [savingMethod, setSavingMethod] = useState<string | null>(null)
  const [savedMethod, setSavedMethod] = useState<string | null>(null)
  const [envSaveError, setEnvSaveError] = useState('')

  const [dragFrom, setDragFrom] = useState<number | null>(null)
  const [dragOver, setDragOver] = useState<number | null>(null)
  // Which row the arrows last moved, so focus can follow it to its new position
  // instead of being dumped back at the top of the page. The direction comes
  // along because the button just pressed is disabled once the row reaches the
  // end, and focus has to land on the other arrow rather than nowhere.
  const focusAfterMove = useRef<{ id: string; direction: 'up' | 'down' } | null>(null)

  useEffect(() => {
    fetch('/api/admin/env').then(async (res) => {
      if (!res.ok) { setEnvAdminAllowed(false); return }
      setEnvAdminAllowed(true)
      setEnvKeyStatus((await res.json()).vars ?? {})
    }).catch(() => setEnvAdminAllowed(false))
  }, [])

  // The list in the owner's own order, with anything a newly installed module
  // brought along on the end. Sorted by the same two functions the checkout
  // goes through, so what this screen shows is the order a shopper meets.
  const byId = new Map((methods ?? []).map((m) => [m.id, m]))
  const ordered = sortPaymentMethods((methods ?? []).map((m) => m.id), resolvePaymentMethodOrder(config))
    .map((id) => byId.get(id))
    .filter((m): m is ShpAdminPaymentMethod => m !== undefined)

  useEffect(() => {
    const target = focusAfterMove.current
    if (!target) return
    focusAfterMove.current = null
    const same = document.getElementById(`shp-move-${target.id}-${target.direction}`) as HTMLButtonElement | null
    if (same && !same.disabled) { same.focus(); return }
    const other = target.direction === 'up' ? 'down' : 'up'
    document.getElementById(`shp-move-${target.id}-${other}`)?.focus()
  })

  // Any change on this screen writes the order out in full, even a plain on/off.
  // Otherwise switching a method off and on again would send it to the back of
  // the checkout queue, having quietly been reordering by tick order all along.
  function writeOrder(ids: string[]) {
    set('paymentMethodOrder', ids)
  }

  function setMethodOn(method: ShpAdminPaymentMethod, on: boolean) {
    const enabled = config.enabledPaymentMethods.filter((m) => m !== method.id)
    const disabled = config.disabledPaymentMethods.filter((m) => m !== method.id)
    if (on) enabled.push(method.id)
    else disabled.push(method.id)
    set('enabledPaymentMethods', enabled)
    set('disabledPaymentMethods', disabled)
    writeOrder(ordered.map((m) => m.id))
  }

  // The owner's own wording for the line under a method's name at checkout. An
  // emptied box is removed from the map rather than stored blank, so the method
  // goes back to the wording it arrived with instead of being left silent by a
  // box someone cleared to see what would happen.
  function setMethodDescription(id: string, text: string) {
    const next = { ...config.paymentMethodDescriptions }
    if (text.trim()) next[id] = text
    else delete next[id]
    set('paymentMethodDescriptions', next)
  }

  // Whether the method's brand mark appears beside its name at checkout. Stored
  // as the list of the ones that do not, so a method nobody has an opinion about
  // keeps showing its mark - including one arriving with a module installed
  // later, which nothing here could have listed in advance.
  // How big an order has to be - and how big it may be - for a method to be
  // offered at all. An emptied box is stored as "no limit that way" rather than
  // as zero, and a method left with neither end set drops out of the map
  // entirely, so clearing both boxes genuinely puts the method back to being
  // offered on everything.
  function setMethodOrderValueLimit(id: string, end: 'min' | 'max', value: string) {
    const amount = value.trim() === '' ? null : Number(value)
    if (amount !== null && (!Number.isFinite(amount) || amount < 0)) return
    const next = { ...config.paymentMethodOrderValueLimits }
    const updated = { ...(next[id] ?? { min: null, max: null }), [end]: amount }
    if (updated.min == null && updated.max == null) delete next[id]
    else next[id] = updated
    set('paymentMethodOrderValueLimits', next)
  }

  function setMethodLogoShown(id: string, shown: boolean) {
    const hidden = config.hiddenPaymentMethodLogos.filter((m) => m !== id)
    if (!shown) hidden.push(id)
    set('hiddenPaymentMethodLogos', hidden)
  }

  function move(from: number, to: number) {
    if (to < 0 || to >= ordered.length || from === to) return
    const moved = ordered[from]
    if (!moved) return
    const ids = ordered.map((m) => m.id)
    ids.splice(from, 1)
    ids.splice(to, 0, moved.id)
    writeOrder(ids)
  }

  function moveByButton(from: number, to: number) {
    const moving = ordered[from]
    if (!moving || to < 0 || to >= ordered.length) return
    focusAfterMove.current = { id: moving.id, direction: to < from ? 'up' : 'down' }
    move(from, to)
  }

  // Chips: the list, then one per method that has settings of its own, then any
  // panel hosted here that no method claimed (an add-on that is not itself a
  // payment method).
  const panelById = new Map(hostedPanels.map((p) => [p.id, p]))
  const claimed = new Set<string>()
  type MethodTab = { key: string; label: string; method?: ShpAdminPaymentMethod; panel?: HostedSettingsPanel }
  const methodTabs: MethodTab[] = []
  for (const method of ordered) {
    if (method.builtIn) {
      methodTabs.push({ key: method.id, label: method.label, method })
      continue
    }
    const panel = method.panelId ? panelById.get(method.panelId) : undefined
    if (panel) {
      claimed.add(panel.id)
      methodTabs.push({ key: `panel:${panel.id}`, label: method.label, method, panel })
    }
  }
  for (const panel of hostedPanels) {
    if (!claimed.has(panel.id)) methodTabs.push({ key: `panel:${panel.id}`, label: panel.label, panel })
  }

  const active = methodTabs.find((t) => t.key === activeTab)
  // A chip for a module that has since been uninstalled leaves nothing to show,
  // so fall back to the list rather than an empty panel.
  const showing = activeTab === PAYMENT_METHODS_TAB || !active ? PAYMENT_METHODS_TAB : activeTab

  const liveMethods = ordered.filter((m) => methodState(m, config) === 'live')

  async function saveCredentials(methodId: string, keys: string[]) {
    setEnvSaveError('')
    setSavingMethod(methodId)
    setSavedMethod(null)
    const vars = keys.filter((k) => envFields[k]?.trim()).map((k) => ({ key: k, value: (envFields[k] ?? '').trim() }))
    if (vars.length === 0) { setSavingMethod(null); return }
    try {
      const res = await fetch('/api/admin/env', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ vars }) })
      const d = await res.json()
      if (!res.ok) {
        setEnvSaveError(d.error ?? 'Save failed')
        return
      }
      setEnvKeyStatus((prev) => {
        const next = { ...prev }
        keys.forEach((k) => { if (envFields[k]?.trim()) next[k] = true })
        return next
      })
      setEnvFields((prev) => {
        const next = { ...prev }
        keys.forEach((k) => { if (prev[k]?.trim()) next[k] = '' })
        return next
      })
      setSavedMethod(methodId)
    } catch {
      setEnvSaveError("Couldn't reach the server. Check your connection and try again.")
    } finally {
      setSavingMethod(null)
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1.5rem' }}>
        <button type="button" style={chipStyle(showing === PAYMENT_METHODS_TAB)} onClick={() => onTabChange(PAYMENT_METHODS_TAB)}>
          Payment methods
          {methods && <span style={{ opacity: 0.7 }}>({liveMethods.length}/{methods.length})</span>}
        </button>
        {methodTabs.map((tab) => (
          <button key={tab.key} type="button" style={chipStyle(showing === tab.key)} onClick={() => onTabChange(tab.key)}>
            {tab.method && (
              <span aria-hidden style={{ width: '0.5rem', height: '0.5rem', borderRadius: '50%', background: STATE_DOT[methodState(tab.method, config)] }} />
            )}
            {tab.label}
          </button>
        ))}
      </div>

      {showing === PAYMENT_METHODS_TAB && (
        <MethodList
          config={config}
          set={set}
          ordered={ordered}
          loading={methods === null}
          liveMethods={liveMethods}
          methodTabs={methodTabs}
          dragFrom={dragFrom}
          dragOver={dragOver}
          onDragStart={setDragFrom}
          onDragOver={setDragOver}
          onDragEnd={() => { setDragFrom(null); setDragOver(null) }}
          onDrop={(to) => { if (dragFrom !== null) move(dragFrom, to); setDragFrom(null); setDragOver(null) }}
          onMove={moveByButton}
          onToggle={setMethodOn}
          onOpen={onTabChange}
          onDescriptionChange={setMethodDescription}
          onLogoShownChange={setMethodLogoShown}
          onOrderValueLimitChange={setMethodOrderValueLimit}
        />
      )}

      {active?.method?.builtIn && (
        <BuiltInMethodPanel
          method={active.method}
          config={config}
          set={set}
          envAdminAllowed={envAdminAllowed}
          envKeyStatus={envKeyStatus}
          envFields={envFields}
          setEnvFields={setEnvFields}
          envSaveError={envSaveError}
          saving={savingMethod === active.method.id}
          saved={savedMethod === active.method.id}
          onSaveCredentials={saveCredentials}
          onToggle={setMethodOn}
        />
      )}

      {active?.panel && (
        <div>
          {/* This panel belongs to another module and saves itself, so shop puts
              no switch and no Save button on it - the on/off lives on the list,
              where every method's does. A line here says which is which. */}
          {active.method && (
            <div
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap',
                padding: '0.75rem 1rem', marginBottom: '1.25rem', borderRadius: 10,
                border: '1px solid var(--color-border)', background: 'var(--color-bg-subtle)',
              }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', flexWrap: 'wrap' }}>
                <StatusBadge state={methodState(active.method, config)} />
                <span style={mutedText}>{reasonLine(active.method, methodState(active.method, config))}</span>
              </span>
              <button type="button" className="btn btn-ghost" style={{ fontSize: 'var(--text-sm)' }} onClick={() => onTabChange(PAYMENT_METHODS_TAB)}>
                ← Switch it on or off
              </button>
            </div>
          )}
          {active.panel.node}
        </div>
      )}
    </div>
  )
}

function MethodList({
  config, set, ordered, loading, liveMethods, methodTabs,
  dragFrom, dragOver, onDragStart, onDragOver, onDragEnd, onDrop, onMove, onToggle, onOpen, onDescriptionChange, onLogoShownChange,
  onOrderValueLimitChange,
}: {
  config: ShpConfig
  set: <K extends keyof ShpConfig>(key: K, value: ShpConfig[K]) => void
  ordered: ShpAdminPaymentMethod[]
  loading: boolean
  liveMethods: ShpAdminPaymentMethod[]
  methodTabs: { key: string; method?: ShpAdminPaymentMethod }[]
  dragFrom: number | null
  dragOver: number | null
  onDragStart: (index: number) => void
  onDragOver: (index: number) => void
  onDragEnd: () => void
  onDrop: (index: number) => void
  onMove: (from: number, to: number) => void
  onToggle: (method: ShpAdminPaymentMethod, on: boolean) => void
  onOpen: (tab: string) => void
  onDescriptionChange: (id: string, text: string) => void
  onLogoShownChange: (id: string, shown: boolean) => void
  onOrderValueLimitChange: (id: string, end: 'min' | 'max', value: string) => void
}) {
  const tabForMethod = new Map(methodTabs.filter((t) => t.method).map((t) => [t.method!.id, t.key]))

  if (loading) return <p style={mutedText}>Loading payment methods…</p>
  if (ordered.length === 0) return <p style={mutedText}>No payment methods are installed.</p>

  return (
    <div>
      <h3 style={sectionHeading}>Payment methods</h3>
      <p className="field-hint" style={{ marginTop: 0, marginBottom: '1rem' }}>
        Switch on whatever you are willing to take. Drag a row, or use the arrows, to set the order shoppers meet them in at
        checkout - the top one is the one already chosen when they get there.
      </p>

      {ordered.map((method, index) => {
        const state = methodState(method, config)
        const on = state !== 'off'
        const isDragging = dragFrom === index
        const isTarget = dragOver === index && dragFrom !== null && dragFrom !== index
        const tabKey = tabForMethod.get(method.id)
        return (
          <div
            key={method.id}
            draggable
            onDragStart={(e) => {
              // Only the handle starts a drag. Everything else on the row is a
              // control, and dragging one of those is never what was meant.
              if (!(e.target as HTMLElement).closest?.('[data-drag-handle]')) { e.preventDefault(); return }
              onDragStart(index)
              e.dataTransfer.effectAllowed = 'move'
            }}
            onDragOver={(e) => { if (dragFrom === null) return; e.preventDefault(); e.dataTransfer.dropEffect = 'move'; onDragOver(index) }}
            onDrop={(e) => { e.preventDefault(); onDrop(index) }}
            onDragEnd={onDragEnd}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.875rem',
              flexWrap: 'wrap',
              padding: '0.875rem 1rem',
              marginBottom: '0.625rem',
              borderRadius: 10,
              border: `1px solid ${isTarget ? 'var(--color-primary)' : 'var(--color-border)'}`,
              background: isTarget ? 'var(--color-primary-subtle)' : 'var(--color-surface)',
              opacity: isDragging ? 0.5 : 1,
            }}
          >
            <span
              data-drag-handle
              aria-hidden
              title="Drag to reorder"
              style={{ cursor: 'grab', color: 'var(--color-text-secondary)', fontSize: '1rem', lineHeight: 1, userSelect: 'none' }}
            >
              ⠿
            </span>

            <span style={{ display: 'flex', flexDirection: 'column', gap: '0.125rem' }}>
              <button
                type="button"
                id={`shp-move-${method.id}-up`}
                onClick={() => onMove(index, index - 1)}
                disabled={index === 0}
                aria-label={`Move ${method.label} up`}
                style={arrowStyle(index === 0)}
              >
                ▲
              </button>
              <button
                type="button"
                id={`shp-move-${method.id}-down`}
                onClick={() => onMove(index, index + 1)}
                disabled={index === ordered.length - 1}
                aria-label={`Move ${method.label} down`}
                style={arrowStyle(index === ordered.length - 1)}
              >
                ▼
              </button>
            </span>

            <span style={{ flex: '1 1 14rem', minWidth: 0 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                <strong style={{ fontSize: 'var(--text-base)' }}>{method.label}</strong>
                <StatusBadge state={state} />
              </span>
              <span style={{ display: 'block', ...mutedText, marginTop: '0.125rem' }}>
                {reasonLine(method, state)}
              </span>
            </span>

            {tabKey && (
              <button type="button" className="btn btn-ghost" style={{ fontSize: 'var(--text-sm)' }} onClick={() => onOpen(tabKey)}>
                {method.ready ? 'Settings' : 'Set up'} →
              </button>
            )}

            <Switch checked={on} onChange={(next) => onToggle(method, next)} label={`Offer ${method.label} at checkout`} />
          </div>
        )
      })}

      <hr style={hr} />
      <h3 style={sectionHeading}>How each method reads at checkout</h3>
      <p className="field-hint" style={{ marginTop: 0, marginBottom: '1rem' }}>
        The sentence beneath the name, saying who handles the money, and whether the method&apos;s logo sits beside it. Every
        method arrives with wording of its own - write over it here if you would rather say it differently, or empty the box to
        have the original back. Methods that brought no logo have nothing to switch.
      </p>
      {ordered.map((method) => (
        <div
          key={method.id}
          style={{
            padding: '0.875rem 1rem',
            marginBottom: '0.625rem',
            borderRadius: 10,
            border: '1px solid var(--color-border)',
            background: 'var(--color-surface)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '0.625rem' }}>
            {method.logo && <MethodLogo logo={method.logo} />}
            <strong style={{ fontSize: 'var(--text-base)', flex: '1 1 8rem' }}>{method.label}</strong>
            {method.logo && (
              <Switch
                checked={!config.hiddenPaymentMethodLogos.includes(method.id)}
                onChange={(next) => onLogoShownChange(method.id, next)}
                label={`Show the ${method.label} logo at checkout`}
              />
            )}
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label className="field-label" htmlFor={`shp-method-blurb-${method.id}`}>The line underneath</label>
            <input
              id={`shp-method-blurb-${method.id}`}
              type="text"
              value={config.paymentMethodDescriptions[method.id] ?? ''}
              placeholder={method.defaultDescription || 'Nothing is shown under this one.'}
              onChange={(e) => onDescriptionChange(method.id, e.target.value)}
            />
          </div>
        </div>
      ))}

      <hr style={hr} />
      <h3 style={sectionHeading}>When each method is offered</h3>
      <p className="field-hint" style={{ marginTop: 0, marginBottom: '1rem' }}>
        Leave both boxes empty and the method is offered on every order, which is what they all do until you say otherwise.
        Fill one in and the method only appears on orders of that size - handy where one way of taking money is cheaper on a
        big order and dearer on a small one. Both figures are the order total the customer pays, VAT and delivery included,
        and both ends count: put {formatLimitExample(config.currencySymbol)} and an order of exactly that amount still
        qualifies.
      </p>
      {ordered.map((method) => {
        const limit = config.paymentMethodOrderValueLimits[method.id]
        return (
          <div
            key={method.id}
            style={{
              display: 'flex', alignItems: 'flex-end', gap: '0.75rem', flexWrap: 'wrap',
              padding: '0.875rem 1rem',
              marginBottom: '0.625rem',
              borderRadius: 10,
              border: '1px solid var(--color-border)',
              background: 'var(--color-surface)',
            }}
          >
            <strong style={{ fontSize: 'var(--text-base)', flex: '1 1 10rem', paddingBottom: '0.5rem' }}>{method.label}</strong>
            <div className="field" style={{ marginBottom: 0, flex: '0 1 10rem' }}>
              <label className="field-label" htmlFor={`shp-method-min-${method.id}`}>Smallest order</label>
              <input
                id={`shp-method-min-${method.id}`}
                type="number"
                step="0.01"
                min={0}
                value={limit?.min ?? ''}
                placeholder="No minimum"
                onChange={(e) => onOrderValueLimitChange(method.id, 'min', e.target.value)}
              />
            </div>
            <div className="field" style={{ marginBottom: 0, flex: '0 1 10rem' }}>
              <label className="field-label" htmlFor={`shp-method-max-${method.id}`}>Largest order</label>
              <input
                id={`shp-method-max-${method.id}`}
                type="number"
                step="0.01"
                min={0}
                value={limit?.max ?? ''}
                placeholder="No maximum"
                onChange={(e) => onOrderValueLimitChange(method.id, 'max', e.target.value)}
              />
            </div>
          </div>
        )
      })}

      <hr style={hr} />
      <h3 style={sectionHeading}>Paying an order after it has been placed</h3>
      <p className="field-hint" style={{ marginTop: 0, marginBottom: '1rem' }}>
        Bank transfer and cash both end the same way: the order sits there until somebody sends the money, and a fair few of
        them never do. On, and an unpaid order offers the automated methods above on the customer&apos;s own order page, so they
        can settle it there and then. The bank details stay put either way - this is another door, not a replacement one.
      </p>
      <div style={{ marginBottom: '1rem' }}>
        <Switch
          checked={config.payOnlineOnOrderPage}
          onChange={(next) => set('payOnlineOnOrderPage', next)}
          label="Let customers pay an unpaid order from their order page"
        />
      </div>

      <hr style={hr} />
      <h3 style={sectionHeading}>What a shopper will see</h3>
      {liveMethods.length === 0 ? (
        <div className="alert alert-warning" style={{ marginBottom: 0 }}>
          Nothing is being offered at checkout at the moment, so nobody can pay for anything. Switch at least one method on, and
          finish setting it up.
        </div>
      ) : (
        <p style={mutedText}>
          {liveMethods.map((m) => m.label).join(', then ')}
          {liveMethods.length === 1 ? ' - and nothing else.' : '.'}
        </p>
      )}
    </div>
  )
}

// The worked example in the hint above, in the shop's own currency rather than
// a hardcoded pound sign - the same figure said twice reads as one rule, which
// is what it is.
function formatLimitExample(symbol: string): string {
  return `a largest order of ${symbol}571 on one method and a smallest order of ${symbol}571.01 on another`
}

const arrowStyle = (disabled: boolean): CSSProperties => ({
  border: '1px solid var(--color-border)',
  background: 'var(--color-surface)',
  color: disabled ? 'var(--color-text-disabled)' : 'var(--color-text-secondary)',
  borderRadius: 4,
  width: '1.5rem',
  height: '1rem',
  fontSize: '0.5rem',
  lineHeight: 1,
  padding: 0,
  cursor: disabled ? 'default' : 'pointer',
  fontFamily: 'inherit',
})

/** The one line that answers "so is it working or not?" without opening its tab. */
function reasonLine(method: ShpAdminPaymentMethod, state: MethodState): string {
  if (state === 'off') return 'Switched off - shoppers are not offered this.'
  if (state === 'live') return 'Working and offered at checkout.'
  return method.builtIn
    ? 'Switched on, but it needs its keys before it can appear at checkout.'
    : 'Switched on here, but its own tab says it is not connected and switched on yet.'
}

function BuiltInMethodPanel({
  method, config, set, envAdminAllowed, envKeyStatus, envFields, setEnvFields, envSaveError, saving, saved, onSaveCredentials, onToggle,
}: {
  method: ShpAdminPaymentMethod
  config: ShpConfig
  set: <K extends keyof ShpConfig>(key: K, value: ShpConfig[K]) => void
  envAdminAllowed: boolean | null
  envKeyStatus: Record<string, boolean>
  envFields: Record<string, string>
  setEnvFields: (updater: (prev: Record<string, string>) => Record<string, string>) => void
  envSaveError: string
  saving: boolean
  saved: boolean
  onSaveCredentials: (methodId: string, keys: string[]) => void
  onToggle: (method: ShpAdminPaymentMethod, on: boolean) => void
}) {
  const meta = BUILT_IN_META[method.id]
  const on = isPaymentMethodSwitchedOn(method, config)
  const keys = meta?.keys?.map((f) => f.key) ?? []
  const hasEntries = keys.some((k) => envFields[k]?.trim())
  const needsCredentials = (CREDENTIAL_METHODS as readonly string[]).includes(method.id)
  // Every required key already stored, but the method still isn't ready - the
  // env var only takes effect on the next deployment, so this is the gap
  // between saving a key and it actually working, not a box left empty.
  const awaitingDeploy = needsCredentials && (meta?.requiredKeys ?? []).every((k) => envKeyStatus[k])

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
        <div style={{ flex: '1 1 20rem' }}>
          <h3 style={sectionHeading}>{method.label}</h3>
          <p style={mutedText}>{meta?.blurb}</p>
        </div>
        <Switch checked={on} onChange={(next) => onToggle(method, next)} label={`Offer ${method.label} at checkout`} />
      </div>

      {on && !method.ready && needsCredentials && (
        <div className="alert alert-warning">
          {awaitingDeploy
            ? 'Switched on and the keys are saved, but a new deployment of your site has to run before they take effect.'
            : 'Switched on, but not being offered yet: the keys below have to be filled in first.'}
        </div>
      )}
      {!on && method.ready && (
        <div className="alert alert-info">
          All set up, just switched off. Nothing here is lost while it is off - flick the switch back and it returns to checkout.
        </div>
      )}

      {meta?.manualNote && <p className="field-hint" style={{ marginTop: 0 }}>{meta.manualNote}</p>}

      {meta?.instructionsKey && (
        <>
          <hr style={hr} />
          <div className="field" style={{ marginBottom: 0 }}>
            <label htmlFor={`shp-${method.id}-instructions`}>{meta.instructionsLabel}</label>
            <p className="field-hint" style={{ marginTop: 0, marginBottom: '0.375rem' }}>{meta.instructionsHint}</p>
            <textarea
              id={`shp-${method.id}-instructions`}
              rows={5}
              value={config[meta.instructionsKey]}
              onChange={(e) => set(meta.instructionsKey!, e.target.value)}
            />
          </div>
          {meta.instructionsOnCheckoutKey && (
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', marginTop: '1rem' }}>
              <div style={{ flex: '1 1 20rem' }}>
                <span style={{ fontWeight: 500 }}>{meta.instructionsOnCheckoutLabel}</span>
                <p className="field-hint" style={{ margin: '0.125rem 0 0' }}>{meta.instructionsOnCheckoutHint}</p>
              </div>
              <Switch
                checked={config[meta.instructionsOnCheckoutKey]}
                onChange={(next) => set(meta.instructionsOnCheckoutKey!, next)}
                label={meta.instructionsOnCheckoutLabel ?? 'Show this on the checkout page too'}
              />
            </div>
          )}
        </>
      )}

      {needsCredentials && (
        <>
          <hr style={hr} />
          <h3 style={sectionHeading}>Your {meta?.shortName ?? method.label} details</h3>
          <p className="field-hint" style={{ marginTop: 0, marginBottom: '1rem' }}>{meta?.keysIntro}</p>

          {envAdminAllowed === false && (
            <p className="field-hint" style={{ marginBottom: '1rem' }}>
              Only a full admin can enter payment keys. Everything else on this tab is yours to change - ask an admin for this bit.
            </p>
          )}

          {envAdminAllowed && (
            <>
              {envSaveError && <div className="alert alert-danger">{envSaveError}</div>}
              <div style={{ display: 'grid', gap: '0.75rem', maxWidth: '32rem' }}>
                {meta?.keys?.map((f) => (
                  <div className="field" key={f.key} style={{ marginBottom: 0 }}>
                    <label htmlFor={`shp-env-${f.key}`} style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem' }}>
                      <span>{f.label}</span>
                      {envKeyStatus[f.key] && <span className="badge badge-success">Saved</span>}
                    </label>
                    {f.type === 'select' ? (
                      <select id={`shp-env-${f.key}`} value={envFields[f.key] ?? ''} onChange={(e) => setEnvFields((prev) => ({ ...prev, [f.key]: e.target.value }))}>
                        <option value="">{envKeyStatus[f.key] ? 'Leave as it is' : (f.options?.[0] ?? '')}</option>
                        {f.options?.map((o) => <option key={o} value={o}>{o}</option>)}
                      </select>
                    ) : (
                      <input
                        id={`shp-env-${f.key}`}
                        type={f.type}
                        autoComplete="off"
                        value={envFields[f.key] ?? ''}
                        onChange={(e) => setEnvFields((prev) => ({ ...prev, [f.key]: e.target.value }))}
                        placeholder={envKeyStatus[f.key] ? 'Already saved - type a new one to replace it' : ''}
                      />
                    )}
                    {f.hint && <span className="field-hint">{f.hint}</span>}
                  </div>
                ))}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap', marginTop: '1rem' }}>
                <button className="btn btn-primary" disabled={saving || !hasEntries} onClick={() => onSaveCredentials(method.id, keys)}>
                  {saving ? 'Saving…' : saved ? '✓ Saved' : 'Save these details'}
                </button>
                <span style={mutedText}>
                  {saved ? 'Saved. They start working on the next deployment of your site.' : 'Saved separately from the rest of this page, and live from the next deployment.'}
                </span>
              </div>
            </>
          )}

          {meta?.webhookPath && (
            <>
              <hr style={hr} />
              <h3 style={sectionHeading}>Letting them tell us when a payment lands</h3>
              <WebhookAddress path={meta.webhookPath} hint={meta.webhookHint ?? ''} />
            </>
          )}
        </>
      )}
    </div>
  )
}
