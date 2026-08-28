'use client'

import { useCallback, useRef, useState, type ComponentType } from 'react'
import { useRouter } from 'next/navigation'
import { HandoverDarkModeNotice, isDarkTheme } from '@/modules/shop/components/public/HandoverDarkModeNotice'
import { PaymentMethodLogo } from '@/modules/shop/components/public/PaymentMethodLogo'
import type { ShopCheckoutPayer, ShopCheckoutPaymentFieldsProps } from '@/modules/shop/components/public/checkout-payment-fields'
import type { PayOnlineMethod } from '@/modules/shop/lib/order-pay-online'

// Settling an order that has already been placed, from the customer's own order
// page.
//
// It is the checkout's payment step with everything the checkout was still
// deciding taken out. There is no basket to watch, no address to fill in, no
// terms to tick and no order to create: all of that happened, and what is left
// is one amount and a short list of ways to hand it over. The seams are the same
// ones the checkout uses - a module's own payment fields arrive through
// 'shop.checkout-payment-fields', and a method that authorises on its own site
// hands over exactly as it does there - so a payment module gets this for
// nothing beyond saying it can settle an order that already exists.
type PreparedIntent = {
  method: string
  approvalUrl?: string
  clientFields?: Record<string, unknown>
}

export function OrderPayOnlinePanel({
  orderId, amount, methods, payer, methodClientFields, paymentFields,
}: {
  orderId: string
  /** What is still owed, already formatted - the button says it out loud. */
  amount: string
  methods: PayOnlineMethod[]
  payer: ShopCheckoutPayer
  /** The publishable, order-independent half of each method's on-page fields,
   *  resolved by the server exactly as the checkout's public config resolves
   *  it. Merged under whatever the intent adds. */
  methodClientFields: Record<string, Record<string, unknown>>
  /** Client components modules registered on 'shop.checkout-payment-fields',
   *  keyed by payment method id. */
  paymentFields?: Record<string, ComponentType<ShopCheckoutPaymentFieldsProps>>
}) {
  const router = useRouter()
  const [method, setMethod] = useState<string | null>(null)
  const [fieldsConfig, setFieldsConfig] = useState<Record<string, unknown> | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [handover, setHandover] = useState<{ url: string; label: string } | null>(null)

  // The last intent this mount created, and the submit function a module's
  // fields registered. Both in refs: paying reads them in the same breath as it
  // creates them, without waiting for a render.
  const preparedRef = useRef<PreparedIntent | null>(null)
  const submitRef = useRef<((config: Record<string, unknown>) => Promise<unknown>) | null>(null)
  const payingRef = useRef(false)

  const prepare = useCallback(async (next: string): Promise<PreparedIntent> => {
    const res = await fetch(`/api/m/shop/member/orders/${encodeURIComponent(orderId)}/pay`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ method: next }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.error ?? 'That payment could not be started.')
    const prepared: PreparedIntent = {
      method: next,
      approvalUrl: typeof data.approvalUrl === 'string' ? data.approvalUrl : undefined,
      clientFields: data.clientFields && typeof data.clientFields === 'object' ? data.clientFields : undefined,
    }
    preparedRef.current = prepared
    return prepared
  }, [orderId])

  // Picking a method. A method with fields of its own has its intent created
  // here rather than on the pay button, because those fields need the amount to
  // authorise before they can draw anything - the same reasoning as the
  // checkout's. A method that simply hands over waits for the button, so nobody
  // is sent to their bank by clicking a radio.
  const choose = useCallback(async (next: string) => {
    setMethod(next)
    setError(null)
    setFieldsConfig(null)
    submitRef.current = null
    preparedRef.current = null
    if (!paymentFields?.[next]) return

    setBusy(true)
    try {
      const prepared = await prepare(next)
      if (prepared.clientFields) {
        setFieldsConfig({ ...(methodClientFields[next] ?? {}), ...prepared.clientFields })
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That payment could not be started.')
    } finally {
      setBusy(false)
    }
  }, [methodClientFields, paymentFields, prepare])

  const pay = useCallback(async () => {
    if (!method) { setError('Choose a way to pay first.'); return }
    // Silently: the first press is still working and the button says so.
    if (payingRef.current) return
    payingRef.current = true
    setBusy(true)
    setError(null)

    try {
      let prepared = preparedRef.current
      const freshlyPrepared = !prepared || prepared.method !== method
      if (freshlyPrepared) prepared = await prepare(method)
      if (!prepared) throw new Error('That payment could not be started.')

      // A method that authorises on its own site. The only place this page hands
      // anybody over, and it happens on the button rather than on the radio.
      if (prepared.approvalUrl) {
        // Fields created by this very press have not been on screen for a frame,
        // and going straight past them would walk the customer past the very
        // thing they were meant to fill in. The second press goes through: a
        // handover method's own fields are a shortcut, never a requirement.
        if (freshlyPrepared && prepared.clientFields && paymentFields?.[method]) {
          throw new Error('Finish the payment details above, then pay.')
        }
        const label = methods.find((m) => m.id === method)?.label ?? method
        // A word of warning first on the dark storefront: the provider draws its
        // own site in its own colours, and a screenful of white at the moment
        // you approve money is a shock nobody needs.
        if (isDarkTheme()) { setHandover({ url: prepared.approvalUrl, label }); return }
        window.location.href = prepared.approvalUrl
        return
      }

      // A module's own fields, filled in on this page. No submit registered is
      // not a failure - fields that only record a choice have nothing to hand
      // over. Whatever does come back goes straight to the server, which asks
      // the provider whether the money moved; nothing here reads it.
      let payload: unknown = {}
      const submit = submitRef.current
      if (submit) {
        payload = await submit({ ...(methodClientFields[method] ?? {}), ...(prepared.clientFields ?? {}) })
      }

      const res = await fetch(`/api/m/shop/member/orders/${encodeURIComponent(orderId)}/pay/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ method, payload }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? 'That payment could not be taken.')

      // The page is rendered fresh on every visit, so asking the server again is
      // enough: the panel disappears, the status changes and the receipt appears,
      // all from the one source of truth rather than from a guess made here.
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That payment could not be taken.')
    } finally {
      payingRef.current = false
      setBusy(false)
    }
  }, [method, methods, methodClientFields, orderId, paymentFields, prepare, router])

  const Fields = method && fieldsConfig ? paymentFields?.[method] : undefined

  return (
    <div style={{ display: 'grid', gap: 'var(--space-3)' }}>
      <div>
        <strong>Or pay {amount} now</strong>
        <p style={{ margin: '0.25rem 0 0', fontSize: 'var(--text-sm)' }}>
          Settle it here instead and we will get on with your order straight away.
        </p>
      </div>

      <div style={{ display: 'grid', gap: '0.5rem' }}>
        {methods.map((option) => (
          // Aligned to the top rather than the middle: with a second line under
          // the name, centring floats the radio and the logo into the gap.
          <label
            key={option.id}
            style={{
              display: 'flex', gap: '0.5rem', alignItems: 'flex-start',
              border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)',
              background: 'var(--color-surface)', padding: '0.5rem 0.75rem',
            }}
          >
            <input
              type="radio"
              name={`shop-pay-online-${orderId}`}
              checked={method === option.id}
              onChange={() => { void choose(option.id) }}
              disabled={busy}
              style={{ marginTop: '0.2rem' }}
            />
            {option.logo && <PaymentMethodLogo logo={option.logo} />}
            <span style={{ display: 'grid', gap: '0.125rem', minWidth: 0 }}>
              <span>{option.label}</span>
              {option.description && (
                <span style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--text-sm)', lineHeight: 1.35 }}>
                  {option.description}
                </span>
              )}
            </span>
          </label>
        ))}
      </div>

      {/* A module's own payment fields, drawn only for the chosen method and only
          once its intent has arrived with something for them to work with - so a
          shop with two card providers installed loads exactly one SDK.
          Deliberately no reassurance line of shop's own underneath: a component
          that collects card details says so itself, where the claim is true. */}
      {Fields && fieldsConfig && (
        <Fields
          config={fieldsConfig}
          payer={payer}
          onError={setError}
          registerSubmit={(submit) => { submitRef.current = submit }}
        />
      )}

      {error && <p style={{ margin: 0, color: 'var(--color-danger)' }}>{error}</p>}

      <div>
        <button type="button" className="btn btn-primary" onClick={() => { void pay() }} disabled={busy || !method}>
          {busy ? 'One moment…' : `Pay ${amount}`}
        </button>
      </div>

      {handover && (
        <HandoverDarkModeNotice
          providerName={handover.label}
          onContinue={() => { window.location.href = handover.url }}
        />
      )}
    </div>
  )
}
