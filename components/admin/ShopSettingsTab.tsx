'use client'

import { Fragment, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { TabStrip } from '@/components/admin/TabStrip'
import type { ModuleSettingsTabProps } from '@/lib/modules/hosted-settings'
import type { ShpConfig } from '@/modules/shop/lib/config'
import type { ShpAdminPaymentMethod } from '@/modules/shop/lib/payments/admin-methods'
import { PaymentsSettings, PAYMENT_METHODS_TAB, isHostedPaymentPanelTab } from '@/modules/shop/components/admin/PaymentsSettings'
import { PRICE_TYPES, PRICE_TYPE_META } from '@/modules/shop/lib/pricing'
import { setTabParams, readTabParam } from '@/modules/shop/lib/admin/tab-url'

type SubTab = 'general' | 'checkout' | 'payments' | 'invoices' | 'notifications'

const SUB_TABS: { key: SubTab; label: string }[] = [
  { key: 'general', label: 'General' },
  { key: 'checkout', label: 'Checkout' },
  { key: 'payments', label: 'Payments' },
  { key: 'invoices', label: 'Invoices' },
  { key: 'notifications', label: 'Notifications' },
]

// Two slots this tab publishes for other modules' settings panels (`host` on
// their manifest settingsTabs entry - see lib/modules/hosted-settings.ts):
//
// - 'shop.payments' puts a panel on the Payments sub-tab. Taken as separate
//   labelled panels rather than one merged node, because each payment method
//   now gets a chip of its own there and a tab strip needs the labels up front.
// - 'shop.settings-sub-tabs' gives a panel a sub-tab of its own, labelled from
//   its manifest entry. For an add-on whose settings are nobody else's business
//   and would only be noise inside one of shop's own sub-tabs.
//
// Both are empty on a shop with no add-ons installed, and an empty slot renders
// nothing: no extra tab, no gap, no diff for a shop-only site owner.
// - 'shop.settings-notifications' puts a panel at the foot of the Notifications
//   sub-tab, where the rest of "who gets told, and when" already lives. Taken as
//   one merged node: it sits under a heading of its own, and shop has nothing to
//   say about it.
const HOSTED_SUB_TAB_SLOT = 'shop.settings-sub-tabs'
const HOSTED_PAYMENTS_SLOT = 'shop.payments'
const HOSTED_NOTIFICATIONS_SLOT = 'shop.settings-notifications'

const checkboxRow: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-3)', cursor: 'pointer' }
const hr: React.CSSProperties = { border: 'none', borderTop: '1px solid var(--color-border)', margin: '1.5rem 0' }
const sectionHeading: React.CSSProperties = { margin: '0 0 1rem', fontSize: '1rem', fontWeight: 600 }
const fieldGrid: React.CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: 'var(--form-gap)' }

// A stable id for a newly added checkout tickbox. It has to outlive the wording
// it was created with, because it is what an order's recorded agreement points
// back at - so it is never derived from the statement or the row's position.
// The fallback covers a browser that withholds randomUUID outside a secure
// context; a settings screen only ever mints a handful of these.
function newAgreementId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  return `agr_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`
}

// Settings panels other modules contribute to this tab's slots, resolved and
// rendered by the core config page and handed down (see HOSTED_SUB_TAB_SLOT
// above, and lib/modules/hosted-settings.ts for the two shapes). Both slots take
// the labelled shape: each contributed panel gets a tab, or a chip on Payments,
// and a tab strip needs the labels up front.
export function ShopSettingsTab({ hostedSettingsPanels, hostedSettingsSlots }: ModuleSettingsTabProps = {}) {
  const router = useRouter()
  const [config, setConfig] = useState<ShpConfig | null>(null)
  // Every payment method registered on this site, shop's own and any a module
  // contributed, for the Payments tab to list and arrange. Null until it lands.
  const [paymentMethods, setPaymentMethods] = useState<ShpAdminPaymentMethod[] | null>(null)
  // Whether the site takes member registrations at all. The post-purchase
  // account prompt needs it, and null (an older cached bundle, or a response
  // that never arrived) means say nothing rather than warn about a state we
  // have not actually been told about.
  const [members, setMembers] = useState<{ enabled: boolean; inviteOnly: boolean } | null>(null)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [saveError, setSaveError] = useState('')
  const [forbidden, setForbidden] = useState(false)
  // Not SubTab: a contributed sub-tab's key is its manifest id, which shop cannot
  // know the set of.
  const [subTab, setSubTab] = useState<string>('general')


  // Which payment method's own settings the Payments sub-tab is showing.
  // Lifted, because shop's Save button has to stand down while a panel that
  // saves itself is on screen.
  const [paymentTab, setPaymentTab] = useState<string>(PAYMENT_METHODS_TAB)

  useEffect(() => {
    // no-store: the browser must never serve a cached copy of this response, or
    // a reload right after saving shows the pre-save values and reads as "it
    // didn't save".
    fetch('/api/m/shop/admin/settings', { cache: 'no-store' }).then(async (res) => {
      if (res.status === 403) { setForbidden(true); return }
      const data = await res.json()
      setConfig(data.config)
      setPaymentMethods(data.paymentMethods ?? [])
      setMembers(data.members ?? null)
    })
  }, [])

  // Which sub-tab is open - and, on Payments, which method's own panel - rides in
  // the URL, so a refresh comes back to it instead of dropping the admin on
  // General. Read once on mount rather than during render: the core settings page
  // renders this on the server too, and reading the location mid-render would
  // have the two disagree.
  useEffect(() => {
    const wanted = readTabParam('sub')
    const known = [
      ...SUB_TABS.map((t) => t.key as string),
      ...(hostedSettingsPanels?.[HOSTED_SUB_TAB_SLOT] ?? []).map((p) => p.id),
    ]
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot read of the URL's tab on mount
    if (wanted && known.includes(wanted)) setSubTab(wanted)
    const pane = readTabParam('pane')
    if (pane) setPaymentTab(pane)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount only; the contributed panels are fixed for the render
  }, [])

  // Clicking a tab writes it back, so the read above has something to find.
  // General is the default, so it carries no param. The payments panel travels
  // with the tab strip rather than being cleared: leaving Payments and coming
  // back has always returned you to the panel you were in.
  function selectSubTab(next: string) {
    setSubTab(next)
    setTabParams({ sub: next === 'general' ? null : next })
  }

  function selectPaymentTab(next: string) {
    setPaymentTab(next)
    setTabParams({ pane: next === PAYMENT_METHODS_TAB ? null : next })
  }


  async function save() {
    if (!config) return
    setSaving(true)
    setMessage('')
    setSaveError('')
    try {
      const res = await fetch('/api/m/shop/admin/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(config) })
      if (res.ok) {
        setConfig((await res.json()).config)
        setMessage('Settings saved.')
        // The sidebar is rendered by the server layout, and switching suppliers
        // on or off adds/removes its link - so ask for a fresh render rather
        // than leaving a stale menu until the next full navigation.
        router.refresh()
      } else {
        // Never fail silently - a swallowed non-2xx is exactly what makes a save
        // look like it did nothing.
        const data = await res.json().catch(() => null)
        setSaveError(data?.error ?? `Couldn't save (error ${res.status}). Please try again.`)
      }
    } catch {
      setSaveError("Couldn't reach the server. Check your connection and try again.")
    } finally {
      setSaving(false)
    }
  }

  if (forbidden) return <div>Only shop managers can view or change shop settings.</div>
  if (!config) return null

  function set<K extends keyof ShpConfig>(key: K, value: ShpConfig[K]) {
    setConfig((c) => (c ? { ...c, [key]: value } : c))
  }

  function setCheckoutStep(id: string, patch: Partial<ShpConfig['checkoutSteps'][number]>) {
    set('checkoutSteps', config!.checkoutSteps.map((step) => (step.id === id ? { ...step, ...patch } : step)))
  }


  // Contributed sub-tabs go after shop's own, in module-load order, so a newly
  // installed add-on never reorders the tabs a site owner already knows.
  const hostedSubTabs = hostedSettingsPanels?.[HOSTED_SUB_TAB_SLOT] ?? []
  const activeHostedSubTab = hostedSubTabs.find((p) => p.id === subTab)
  const hostedPaymentPanels = hostedSettingsPanels?.[HOSTED_PAYMENTS_SLOT] ?? []
  // A payment module's own panel is on the Payments tab now, so the same rule
  // that stands the Save button down for a contributed sub-tab applies there.
  // A panel whose module has since been uninstalled shows the methods list
  // instead (PaymentsSettings falls back), so the Save button has to come back
  // with it rather than stay hidden behind a chip that is no longer there.
  const showingHostedPaymentPanel = subTab === 'payments' && isHostedPaymentPanelTab(paymentTab)
    && hostedPaymentPanels.some((p) => paymentTab === `panel:${p.id}`)

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 'var(--space-4)' }}>
        {/* A contributed sub-tab saves its own settings through its own module's
            API. Shop's Save button would not save it, so showing one over it
            only invites the click that appears to do nothing. */}
        {!activeHostedSubTab && !showingHostedPaymentPanel && (
          <button className="btn btn-primary" disabled={saving} onClick={save}>
            {saving ? 'Saving…' : 'Save settings'}
          </button>
        )}
      </div>

      <TabStrip
        items={[
          ...SUB_TABS.map((t) => ({ key: t.key as string, label: t.label })),
          ...hostedSubTabs.map((p) => ({ key: p.id, label: p.label })),
        ].map((t) => ({ key: t.key, label: t.label, active: t.key === subTab, onClick: () => selectSubTab(t.key) }))}
      />

      {message && <div className="alert alert-success" style={{ marginBottom: '1rem' }}>{message}</div>}
      {saveError && <div className="alert alert-danger" style={{ marginBottom: '1rem' }}>{saveError}</div>}

      {subTab === 'general' && (
        <div>
          <div style={fieldGrid}>
            <div className="field" style={{ margin: 0 }}><label>Currency code</label><input value={config.currency} onChange={(e) => set('currency', e.target.value)} /></div>
            <div className="field" style={{ margin: 0 }}><label>Currency symbol</label><input value={config.currencySymbol} onChange={(e) => set('currencySymbol', e.target.value)} /></div>
          </div>
          <div style={fieldGrid}>
            <div className="field" style={{ margin: 0 }}><label>Store email</label><input type="email" value={config.storeEmail} onChange={(e) => set('storeEmail', e.target.value)} /></div>
            <div className="field" style={{ margin: 0 }}>
              <label>Order number prefix</label>
              <input value={config.orderNumberPrefix} onChange={(e) => set('orderNumberPrefix', e.target.value)} />
              <span className="field-hint">Order numbers look like {config.orderNumberPrefix || 'ORD-'}1001.</span>
            </div>
          </div>
          <div style={fieldGrid}>
            <div className="field" style={{ margin: 0 }}>
              <label>Weight unit</label>
              <select value={config.weightUnit} onChange={(e) => set('weightUnit', e.target.value as ShpConfig['weightUnit'])}>
                <option value="kg">Kilograms</option>
                <option value="lb">Pounds</option>
              </select>
            </div>
            <div className="field" style={{ margin: 0 }}>
              <label>Dimension unit</label>
              <select value={config.dimensionUnit} onChange={(e) => set('dimensionUnit', e.target.value as ShpConfig['dimensionUnit'])}>
                <option value="cm">Centimetres</option>
                <option value="in">Inches</option>
              </select>
            </div>
          </div>

          <hr style={hr} />
          <h3 style={sectionHeading}>Shop status</h3>
          <div className="field">
            <label>Status</label>
            <select value={config.shopStatus} onChange={(e) => set('shopStatus', e.target.value as ShpConfig['shopStatus'])}>
              <option value="OPEN">Open</option>
              <option value="BROWSE_ONLY">Browse only (no checkout)</option>
              <option value="CLOSED">Closed</option>
            </select>
          </div>
          <div className="field">
            <label>Closed message</label>
            <input value={config.shopClosedMessage} onChange={(e) => set('shopClosedMessage', e.target.value)} />
            <span className="field-hint">Shown to visitors while the shop is browse-only or closed.</span>
          </div>

          <hr style={hr} />
          <h3 style={sectionHeading}>Category pages</h3>
          <div className="field">
            <label>Products shown on a category page</label>
            <select value={config.categoryProductDisplayMode} onChange={(e) => set('categoryProductDisplayMode', e.target.value as ShpConfig['categoryProductDisplayMode'])}>
              <option value="rollup">The category and all its sub-categories</option>
              <option value="exact">Only products filed directly on the category</option>
            </select>
            <span className="field-hint">The default for every category. Any individual category can override this on the Categories screen.</span>
          </div>

          <hr style={hr} />
          <h3 style={sectionHeading}>Out of stock products</h3>
          <div className="field">
            <label>When something sells out</label>
            <select value={config.outOfStockVisibility} onChange={(e) => set('outOfStockVisibility', e.target.value as ShpConfig['outOfStockVisibility'])}>
              <option value="SHOW">Leave it where it is, marked out of stock</option>
              <option value="HIDE_FROM_LISTS">Take it out of the listings, keep its page</option>
              <option value="HIDE_EVERYWHERE">Hide it completely, page and all</option>
            </select>
            <span className="field-hint">
              Taking it out of the listings clears it from category pages, collections, product grids, search and your
              sitemap, while anyone holding a link to it still lands on the product page and can ask to be told when it
              is back. Hiding it completely gives them a page-not-found instead. Either way it returns on its own the
              moment there is stock again.
            </span>
          </div>
          {config.outOfStockVisibility !== 'SHOW' && (
            <>
              <label style={checkboxRow}>
                <input type="checkbox" checked={config.outOfStockHiddenFromStaff} onChange={(e) => set('outOfStockHiddenFromStaff', e.target.checked)} />
                Hide them from me and my staff as well
              </label>
              <p className="field-hint" style={{ marginBottom: 'var(--form-gap)' }}>
                Leave this off and anyone signed in with shop access still sees hidden products on the storefront,
                wearing their usual out-of-stock badge, so nothing quietly disappears without you noticing. Tick it to
                walk your own shop exactly as a shopper sees it.
              </p>
            </>
          )}
          <p className="field-hint" style={{ marginBottom: 'var(--form-gap)' }}>
            Only things you actually count are ever hidden: a product with stock tracking switched off, one taking
            backorders, or one on pre-order stays put. Your Products screen always lists the lot regardless, which is
            rather the point of it.
          </p>

          <hr style={hr} />
          <h3 style={sectionHeading}>Prices</h3>
          <p className="field-hint" style={{ marginTop: 0 }}>
            Every product has a price, and that one is not optional. Switch on any of the others you keep track of and they appear on the Pricing tab of each product.
          </p>
          {PRICE_TYPES.map((type) => (
            <div key={type}>
              <label style={checkboxRow}>
                <input
                  type="checkbox"
                  checked={config.enabledPriceTypes.includes(type)}
                  onChange={(e) => set(
                    'enabledPriceTypes',
                    (e.target.checked
                      ? [...config.enabledPriceTypes, type]
                      : config.enabledPriceTypes.filter((t) => t !== type)) as ShpConfig['enabledPriceTypes'],
                  )}
                />
                {PRICE_TYPE_META[type].label}
              </label>
              <p className="field-hint" style={{ marginBottom: '0.5rem' }}>{PRICE_TYPE_META[type].blurb}</p>
            </div>
          ))}
          {config.enabledPriceTypes.includes('retail') && (
            <>
              <label style={checkboxRow}>
                <input type="checkbox" checked={config.showRetailPrice} onChange={(e) => set('showRetailPrice', e.target.checked)} />
                Show the retail price to shoppers
              </label>
              <p className="field-hint" style={{ marginBottom: 'var(--form-gap)' }}>
                Prints it as &quot;RRP&quot; beside the price, on product pages and cards, whenever it is higher than what you are charging. Leave this off to keep the RRP as your own reference.
              </p>
            </>
          )}
          <p className="field-hint" style={{ marginBottom: 'var(--form-gap)' }}>
            Switching a price off hides the box but keeps whatever you had typed in it, so switching it back on gets your figures back. While a sale price is switched off, nothing is on offer and shoppers pay the normal price.
          </p>

          <hr style={hr} />
          <h3 style={sectionHeading}>Suppliers</h3>
          <label style={checkboxRow}>
            <input type="checkbox" checked={config.supplierFieldEnabled} onChange={(e) => set('supplierFieldEnabled', e.target.checked)} />
            Enable suppliers support
          </label>
          <p className="field-hint" style={{ marginBottom: 'var(--form-gap)' }}>
            Adds a Suppliers screen to the menu for keeping their account numbers, discounts and contact details, and a box on each product for picking who you got the thing from. Switching it off later hides both but keeps everything you had recorded.
          </p>
          {config.supplierFieldEnabled && (
            <>
              <div className="field">
                <label>Call it</label>
                <select value={config.supplierLabelPreset} onChange={(e) => set('supplierLabelPreset', e.target.value as ShpConfig['supplierLabelPreset'])}>
                  <option value="Supplier">Supplier</option>
                  <option value="Manufacturer">Manufacturer</option>
                  <option value="Retailer">Retailer</option>
                  <option value="Importer">Importer</option>
                  <option value="custom">Something else</option>
                </select>
                <span className="field-hint">The wording used wherever the field appears.</span>
              </div>
              {config.supplierLabelPreset === 'custom' && (
                <div className="field">
                  <label>Your wording</label>
                  <input value={config.supplierLabelCustom} onChange={(e) => set('supplierLabelCustom', e.target.value)} placeholder="Supplier" />
                  <span className="field-hint">Leave this empty and it falls back to &quot;Supplier&quot;.</span>
                </div>
              )}
              <label style={checkboxRow}>
                <input type="checkbox" checked={config.supplierShowOnFrontend} onChange={(e) => set('supplierShowOnFrontend', e.target.checked)} />
                Show the supplier&apos;s name to shoppers
              </label>
              <p className="field-hint" style={{ marginBottom: 'var(--form-gap)' }}>
                Off keeps it as your own reference, on prints it on the product page.
              </p>
              <div className="field">
                <label>Add supplier field to</label>
                <select value={config.supplierFieldScope} onChange={(e) => set('supplierFieldScope', e.target.value as ShpConfig['supplierFieldScope'])}>
                  <option value="PRODUCTS">Products only</option>
                  <option value="PRODUCTS_AND_VARIATIONS">Products and variations</option>
                </select>
                <span className="field-hint">Pick the second one when different variations of the same product come from different places.</span>
              </div>
              <label style={checkboxRow}>
                <input type="checkbox" checked={config.supplierPagesEnabled} onChange={(e) => set('supplierPagesEnabled', e.target.checked)} />
                Give suppliers a page of their own
              </label>
              <p className="field-hint" style={{ marginBottom: 'var(--form-gap)' }}>
                Adds a page per supplier at /shop/suppliers, listing everything of theirs with your filters on it and room for a write-up above. Each supplier still has to be switched on individually on the Suppliers screen, so turning this on publishes nothing by itself.
              </p>
            </>
          )}

          <hr style={hr} />
          <h3 style={sectionHeading}>SEO</h3>
          <div className="field"><label>Shop title</label><input value={config.shopTitle} onChange={(e) => set('shopTitle', e.target.value)} /></div>
          <div className="field"><label>Meta description</label><textarea rows={3} value={config.shopMetaDescription} onChange={(e) => set('shopMetaDescription', e.target.value)} /></div>
          <div className="field">
            <label>Product page address</label>
            <select value={config.productUrlStyle} onChange={(e) => set('productUrlStyle', e.target.value as ShpConfig['productUrlStyle'])}>
              <option value="SHOP">/shop/products/product-name (standard)</option>
              <option value="ROOT">/product-name (site root)</option>
            </select>
            <span className="field-hint">
              Only the product page itself moves; categories, collections and the cart stay under /shop.
              The old address keeps working either way, and tells search engines where the page now lives,
              so switching breaks nothing already shared or indexed. A page with the same address wins the
              spot - keep product names distinctive.
            </span>
          </div>
        </div>
      )}

      {subTab === 'checkout' && (
        <div>
          <div className="field">
            <label>Tax mode</label>
            <select value={config.taxMode} onChange={(e) => set('taxMode', e.target.value as ShpConfig['taxMode'])}>
              <option value="INCLUSIVE">Inclusive (prices already include tax)</option>
              <option value="EXCLUSIVE">Exclusive (tax added at checkout)</option>
            </select>
          </div>

          <hr style={hr} />
          <h3 style={sectionHeading}>Checkout rules</h3>
          <label style={checkboxRow}>
            <input type="checkbox" checked={config.guestCheckoutEnabled} onChange={(e) => set('guestCheckoutEnabled', e.target.checked)} />
            Allow guest checkout
          </label>
          <label style={checkboxRow}>
            <input type="checkbox" checked={config.postPurchaseAccountPrompt} onChange={(e) => set('postPurchaseAccountPrompt', e.target.checked)} />
            Prompt guests to create an account after purchase
          </label>
          {/* Said here, where the switch is, rather than left for the owner to
              work out from a confirmation page that never mentions accounts. */}
          {config.postPurchaseAccountPrompt && members && !members.enabled && (
            <p className="field-hint" style={{ marginTop: '-0.25rem', marginBottom: '0.5rem' }}>
              This is doing nothing at the moment: accounts are switched off for the whole site, so there is none for a
              shopper to create. Turn them on under Settings → Users → Registration.
            </p>
          )}
          {config.postPurchaseAccountPrompt && members?.enabled && members.inviteOnly && (
            <p className="field-hint" style={{ marginTop: '-0.25rem', marginBottom: '0.5rem' }}>
              This is doing nothing at the moment: accounts are invite-only, so a shopper who accepted would only be
              turned away. Change that under Settings → Users → Registration.
            </p>
          )}
          <label style={checkboxRow}>
            <input type="checkbox" checked={config.requirePhone} onChange={(e) => set('requirePhone', e.target.checked)} />
            Require a phone number at checkout
          </label>

          <hr style={hr} />
          <h3 style={sectionHeading}>Order history</h3>
          <p className="field-hint" style={{ marginTop: '-0.5rem' }}>
            What a signed-in customer can do on their own copy of an order they have already placed.
          </p>
          <label style={checkboxRow}>
            <input type="checkbox" checked={config.buyAgainEnabled} onChange={(e) => set('buyAgainEnabled', e.target.checked)} />
            Let customers order the same thing again
          </label>
          <p className="field-hint" style={{ marginTop: '-0.25rem', marginBottom: '0.5rem' }}>
            Puts a &ldquo;Buy again&rdquo; button on every line, which drops it straight back in the basket. A line with
            options picked on it sends them to the product page with those same options already chosen, because
            guessing at last year&rsquo;s engraving is how somebody ends up with the wrong name on it.
          </p>

          <hr style={hr} />
          <h3 style={sectionHeading}>Cancellations and returns</h3>
          <p className="field-hint" style={{ marginTop: '-0.5rem' }}>
            Requests arrive under Shop → Cancellations &amp; returns for you to approve or decline. Nothing is ever
            decided automatically, and no money moves until you say so.
          </p>
          <label style={checkboxRow}>
            <input type="checkbox" checked={config.cancelRequestsEnabled} onChange={(e) => set('cancelRequestsEnabled', e.target.checked)} />
            Let customers ask to cancel an order
          </label>
          <p className="field-hint" style={{ marginTop: '-0.25rem', marginBottom: '0.5rem' }}>
            Only offered while nothing has been dispatched. Once part of an order is on its way, it is a return.
          </p>
          <label style={checkboxRow}>
            <input type="checkbox" checked={config.returnRequestsEnabled} onChange={(e) => set('returnRequestsEnabled', e.target.checked)} />
            Let customers ask to return something
          </label>
          {config.returnRequestsEnabled && (
            <div className="field" style={{ margin: '0 0 0.5rem', maxWidth: 260 }}>
              <label>Return window (days)</label>
              <input
                type="number"
                min={0}
                max={3650}
                value={config.returnWindowDays}
                onChange={(e) => set('returnWindowDays', Math.max(0, Math.min(3650, Number(e.target.value) || 0)))}
              />
              <p className="field-hint">
                Counted from the day the last parcel went out, not the day they ordered - an order that waited on your
                shelf should not eat the customer&rsquo;s window. Zero takes returns off the website entirely.
              </p>
            </div>
          )}
          <div style={fieldGrid}>
            <div className="field" style={{ margin: 0 }}>
              <label>Minimum order value</label>
              <input type="number" step="0.01" min={0} value={config.minimumOrderValue ?? ''} onChange={(e) => set('minimumOrderValue', e.target.value ? Number(e.target.value) : null)} placeholder="No minimum" />
            </div>
            <div className="field" style={{ margin: 0 }}>
              <label>Maximum order value</label>
              <input type="number" step="0.01" min={0} value={config.maximumOrderValue ?? ''} onChange={(e) => set('maximumOrderValue', e.target.value ? Number(e.target.value) : null)} placeholder="No maximum" />
            </div>
          </div>

          <hr style={hr} />
          <h3 style={sectionHeading}>Organisation name</h3>
          <p className="field-hint" style={{ marginBottom: '0.75rem' }}>
            Adds a box directly under the customer&apos;s own name, because it says who they are rather than where the parcel goes. Worth switching
            on if you sell to businesses and they need it on the paperwork. Anyone who wants the company on the delivery label puts it in the first
            line of the address, which is where a courier reads it.
          </p>
          <label style={checkboxRow}>
            <input type="checkbox" checked={config.organisationFieldEnabled} onChange={(e) => set('organisationFieldEnabled', e.target.checked)} />
            Ask for an organisation name at checkout
          </label>
          {config.organisationFieldEnabled && (
            <>
              <label style={checkboxRow}>
                <input type="checkbox" checked={config.organisationRequired} onChange={(e) => set('organisationRequired', e.target.checked)} />
                Orders can&apos;t be placed without one
              </label>
              <div className="field">
                <label>What to call it</label>
                <input type="text" value={config.organisationLabel} onChange={(e) => set('organisationLabel', e.target.value)} placeholder="Organisation name" />
                <p className="field-hint">Company name, practice name, school - whatever your customers would call themselves.</p>
              </div>
            </>
          )}

          <hr style={hr} />
          <h3 style={sectionHeading}>Their own order reference</h3>
          <p className="field-hint" style={{ marginBottom: '0.75rem' }}>
            A box for the customer&apos;s own number for the order - the purchase order number their finance team raised, or a job reference. It goes
            on the invoice and the proforma, and you can search your orders by it. Worth switching on if you sell to businesses: an invoice that
            arrives without their number on it tends to sit in somebody&apos;s tray rather than get paid.
          </p>
          <label style={checkboxRow}>
            <input type="checkbox" checked={config.customerReferenceFieldEnabled} onChange={(e) => set('customerReferenceFieldEnabled', e.target.checked)} />
            Ask for their own reference at checkout
          </label>
          {config.customerReferenceFieldEnabled && (
            <>
              <label style={checkboxRow}>
                <input type="checkbox" checked={config.customerReferenceRequired} onChange={(e) => set('customerReferenceRequired', e.target.checked)} />
                Orders can&apos;t be placed without one
              </label>
              <div className="field">
                <label>What to call it</label>
                <input type="text" value={config.customerReferenceLabel} onChange={(e) => set('customerReferenceLabel', e.target.value)} placeholder="Purchase order number" />
                <p className="field-hint">Whatever your customers call it. This is the wording on the checkout box and on the paperwork.</p>
              </div>
              <label style={checkboxRow}>
                <input type="checkbox" checked={config.customerReferenceAfterOrder} onChange={(e) => set('customerReferenceAfterOrder', e.target.checked)} />
                Let customers add it later, from their own order page
              </label>
              <p className="field-hint" style={{ marginTop: '-0.25rem' }}>
                For the buyer whose finance team raises the number a week after they ordered. It goes on their invoice the moment they add it - unless
                the invoice already went out with a number on it, in which case they are asked to ring you rather than quietly change paperwork you
                have already sent.
              </p>
            </>
          )}

          <hr style={hr} />
          <h3 style={sectionHeading}>Billing address</h3>
          <p className="field-hint" style={{ marginBottom: '0.75rem' }}>
            Adds a tickbox under the delivery address for customers whose invoice goes somewhere other than the parcel - a head office, an accounts
            department, a landlord. Leave it off if the two are always the same, which for most shops they are. Nothing is recorded unless a customer
            ticks the box, and what they fill in is what prints on their invoice and receipt.
          </p>
          <label style={checkboxRow}>
            <input type="checkbox" checked={config.billingAddressEnabled} onChange={(e) => set('billingAddressEnabled', e.target.checked)} />
            Let customers give a different billing address
          </label>

          <hr style={hr} />
          <h3 style={sectionHeading}>Tickboxes at checkout</h3>
          <p className="field-hint" style={{ marginBottom: '0.75rem' }}>
            These appear just above the Place order button. A required one has to be ticked before the order will go through, and what was ticked is
            recorded on the order exactly as it was worded on the day.
          </p>
          <label style={checkboxRow}>
            <input type="checkbox" checked={config.termsAgreementEnabled} onChange={(e) => set('termsAgreementEnabled', e.target.checked)} />
            Ask buyers to agree to your terms and conditions
          </label>
          {config.termsAgreementEnabled && (
            <div style={{ border: '1px solid var(--color-border)', borderRadius: 8, padding: '0.875rem 1rem', marginBottom: 'var(--form-gap)' }}>
              <label style={checkboxRow}>
                <input type="checkbox" checked={config.termsAgreementRequired} onChange={(e) => set('termsAgreementRequired', e.target.checked)} />
                Must be ticked to place an order
              </label>
              <div className="field">
                <label>Wording</label>
                <input type="text" value={config.termsAgreementStatement} onChange={(e) => set('termsAgreementStatement', e.target.value)} placeholder="I have read and agree to the [terms and conditions]" />
                <p className="field-hint">Put square brackets round the words you want turned into the link, like [terms and conditions].</p>
              </div>
              <div className="field" style={{ marginBottom: 0 }}>
                <label>Link to</label>
                <input type="text" value={config.termsAgreementUrl} onChange={(e) => set('termsAgreementUrl', e.target.value)} placeholder="Leave blank to use your site's terms page" />
                <p className="field-hint">Left blank, it points at whichever page you&apos;ve set as your terms page, so moving that page never leaves a dead link here.</p>
              </div>
            </div>
          )}

          {config.checkoutAgreements.map((agreement, index) => (
            <div key={agreement.id} style={{ border: '1px solid var(--color-border)', borderRadius: 8, padding: '0.875rem 1rem', marginBottom: 'var(--form-gap)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', marginBottom: '0.75rem' }}>
                <strong style={{ fontSize: '0.875rem' }}>Tickbox {index + 1}</strong>
                <button
                  type="button"
                  onClick={() => set('checkoutAgreements', config.checkoutAgreements.filter((a) => a.id !== agreement.id))}
                  style={{ background: 'none', border: '1px solid var(--color-border)', borderRadius: 6, padding: '0.25rem 0.625rem', color: 'var(--color-danger)', cursor: 'pointer', fontSize: '0.8125rem' }}
                >
                  Remove
                </button>
              </div>
              <label style={checkboxRow}>
                <input
                  type="checkbox"
                  checked={agreement.enabled}
                  onChange={(e) => set('checkoutAgreements', config.checkoutAgreements.map((a) => (a.id === agreement.id ? { ...a, enabled: e.target.checked } : a)))}
                />
                Show this one at checkout
              </label>
              <label style={checkboxRow}>
                <input
                  type="checkbox"
                  checked={agreement.required}
                  onChange={(e) => set('checkoutAgreements', config.checkoutAgreements.map((a) => (a.id === agreement.id ? { ...a, required: e.target.checked } : a)))}
                />
                Must be ticked to place an order
              </label>
              <div className="field">
                <label>Wording</label>
                <input
                  type="text"
                  value={agreement.statement}
                  onChange={(e) => set('checkoutAgreements', config.checkoutAgreements.map((a) => (a.id === agreement.id ? { ...a, statement: e.target.value } : a)))}
                  placeholder="I'm happy to be contacted about my order"
                />
                <p className="field-hint">Square brackets make a link, like [privacy notice]. A tickbox with nothing written beside it is simply left out.</p>
              </div>
              <div className="field" style={{ marginBottom: 0 }}>
                <label>Link to (optional)</label>
                <input
                  type="text"
                  value={agreement.linkUrl}
                  onChange={(e) => set('checkoutAgreements', config.checkoutAgreements.map((a) => (a.id === agreement.id ? { ...a, linkUrl: e.target.value } : a)))}
                  placeholder="/privacy"
                />
              </div>
            </div>
          ))}
          <button
            type="button"
            onClick={() => set('checkoutAgreements', [...config.checkoutAgreements, { id: newAgreementId(), statement: '', linkUrl: '', required: true, enabled: true }])}
            style={{ background: 'var(--color-bg-subtle)', border: '1px solid var(--color-border)', borderRadius: 8, padding: '0.5rem 0.875rem', cursor: 'pointer', marginBottom: 'var(--form-gap)' }}
          >
            Add a tickbox
          </button>

          <hr style={hr} />
          <h3 style={sectionHeading}>Checkout steps</h3>
          <p className="field-hint" style={{ marginBottom: '0.75rem' }}>Choose which steps appear at checkout, and which ones can&apos;t be skipped.</p>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr auto auto', border: '1px solid var(--color-border)', borderRadius: 8, overflow: 'hidden', marginBottom: 'var(--form-gap)' }}>
            {(() => {
              const headerCellStyle: React.CSSProperties = { padding: '0.5rem 0.75rem', fontSize: '0.75rem', fontWeight: 500, color: 'var(--color-text-secondary)', background: 'var(--color-bg-subtle)', borderBottom: '1px solid var(--color-border)' }
              return (
                <>
                  <div style={headerCellStyle}>Step</div>
                  <div style={{ ...headerCellStyle, textAlign: 'center' }}>Enabled</div>
                  <div style={{ ...headerCellStyle, textAlign: 'center' }}>Required</div>
                </>
              )
            })()}
            {config.checkoutSteps.map((step) => {
              const cellStyle: React.CSSProperties = { padding: '0.75rem', background: 'var(--color-surface)' }
              return (
                <Fragment key={step.id}>
                  <div className="field" style={{ margin: 0, ...cellStyle }}>
                    <input value={step.label} onChange={(e) => setCheckoutStep(step.id, { label: e.target.value })} style={{ width: '100%' }} />
                  </div>
                  <div style={{ ...cellStyle, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <input type="checkbox" checked={step.enabled} onChange={(e) => setCheckoutStep(step.id, { enabled: e.target.checked })} style={{ width: '1.25rem', height: '1.25rem' }} />
                  </div>
                  <div style={{ ...cellStyle, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <input type="checkbox" checked={step.required} onChange={(e) => setCheckoutStep(step.id, { required: e.target.checked })} style={{ width: '1.25rem', height: '1.25rem' }} />
                  </div>
                </Fragment>
              )
            })}
          </div>

          <hr style={hr} />
          <h3 style={sectionHeading}>Back-in-stock</h3>
          <label style={checkboxRow}>
            <input type="checkbox" checked={config.backInStockAccountPrompt} onChange={(e) => set('backInStockAccountPrompt', e.target.checked)} />
            Prompt for an account when signing up for a back-in-stock alert
          </label>

          <hr style={hr} />
          <h3 style={sectionHeading}>Pre-orders</h3>
          <div className="field">
            <label>Mixed cart behaviour</label>
            <select value={config.preOrderMixedCartBehaviour} onChange={(e) => set('preOrderMixedCartBehaviour', e.target.value as ShpConfig['preOrderMixedCartBehaviour'])}>
              <option value="HOLD_ALL">Hold the entire order until every item is in stock</option>
              <option value="PROMPT_SPLIT">Offer to split shipping between in-stock and pre-order items</option>
            </select>
          </div>
        </div>
      )}

      {subTab === 'payments' && (
        <PaymentsSettings
          config={config}
          set={set}
          methods={paymentMethods}
          hostedPanels={hostedPaymentPanels}
          activeTab={paymentTab}
          onTabChange={selectPaymentTab}
        />
      )}

      {subTab === 'invoices' && (
        <div>
          <p style={{ margin: '0 0 var(--space-4)', color: 'var(--color-text-secondary)', fontSize: 'var(--text-sm)' }}>
            An invoice is not a receipt. It carries your trading details, your VAT registration and a number that
            has to stay unique and in sequence - so it is off until you say otherwise. What the document actually
            looks like is designed under Appearance &gt; Layouts, as the &ldquo;Invoice document&rdquo; layout.
          </p>

          <label style={checkboxRow}>
            <input type="checkbox" checked={config.invoicesEnabled} onChange={(e) => set('invoicesEnabled', e.target.checked)} />
            Raise invoices for orders
          </label>
          {/* Its own switch, and deliberately not nested under the one above: a
              shop can perfectly well want to send proformas to its bank-transfer
              customers without invoicing anything. The two share your trading
              details below, which is why turning either on brings that section
              out. */}
          <label style={checkboxRow}>
            <input type="checkbox" checked={config.proformaEnabled} onChange={(e) => set('proformaEnabled', e.target.checked)} />
            Send a proforma invoice on orders nobody has paid yet
          </label>

          {config.invoicesEnabled && (
            <>
              <div style={fieldGrid}>
                <div className="field" style={{ margin: 0 }}>
                  <label>Raise one when an order is</label>
                  <select value={config.invoiceIssueOn} onChange={(e) => set('invoiceIssueOn', e.target.value as ShpConfig['invoiceIssueOn'])}>
                    <option value="COMPLETED">Completed</option>
                    <option value="DISPATCHED">Dispatched</option>
                    <option value="PAID">Paid for</option>
                    <option value="MANUAL">Never - I will raise them myself</option>
                  </select>
                  <span className="field-hint">There is a button on every order either way.</span>
                </div>
                <div className="field" style={{ margin: 0 }}>
                  <label>Invoice number prefix</label>
                  <input value={config.invoiceNumberPrefix} onChange={(e) => set('invoiceNumberPrefix', e.target.value)} />
                  <span className="field-hint">
                    Invoice numbers look like {config.invoiceNumberPrefix || 'INV-'}000123. The running number cannot be
                    edited - that is rather the point of it.
                  </span>
                </div>
              </div>
            </>
          )}

          {/* Shared by both documents, so it comes out when either is switched
              on. A proforma carries the same trading details and the same VAT
              number as an invoice - it is the same business on the same paper,
              saying "please pay" rather than "you have paid". */}
          {(config.invoicesEnabled || config.proformaEnabled) && (
            <>
              <hr style={hr} />
              <h3 style={sectionHeading}>Your details, as they appear on your paperwork</h3>
              {!config.invoiceVatNumber.trim() && (
                <p style={{ margin: '0 0 var(--space-3)', color: 'var(--color-text-secondary)', fontSize: 'var(--text-sm)' }}>
                  No VAT registration number yet. Without one the document is a bill rather than a VAT invoice, and a
                  customer reclaiming the tax will be back in touch.
                </p>
              )}
              <div style={fieldGrid}>
                <div className="field" style={{ margin: 0 }}>
                  <label>Business name</label>
                  <input value={config.invoiceBusinessName} onChange={(e) => set('invoiceBusinessName', e.target.value)} placeholder={config.shopTitle || 'Your registered business name'} />
                </div>
                <div className="field" style={{ margin: 0 }}>
                  <label>VAT registration number</label>
                  <input value={config.invoiceVatNumber} onChange={(e) => set('invoiceVatNumber', e.target.value)} placeholder="GB 123 4567 89" />
                </div>
              </div>
              <div className="field">
                <label>Trading address</label>
                <textarea rows={4} value={config.invoiceAddress} onChange={(e) => set('invoiceAddress', e.target.value)} placeholder={'12 Example Street\nLeeds\nLS1 1AA'} />
                <span className="field-hint">One line each. Printed under your name at the top of the invoice.</span>
              </div>
              <div style={fieldGrid}>
                <div className="field" style={{ margin: 0 }}>
                  <label>Company number</label>
                  <input value={config.invoiceCompanyNumber} onChange={(e) => set('invoiceCompanyNumber', e.target.value)} placeholder="01234567" />
                </div>
                <div className="field" style={{ margin: 0 }}>
                  <label>Accounts email</label>
                  <input type="email" value={config.invoiceContactEmail} onChange={(e) => set('invoiceContactEmail', e.target.value)} placeholder={config.storeEmail || 'accounts@example.com'} />
                </div>
              </div>
              <div style={fieldGrid}>
                <div className="field" style={{ margin: 0 }}>
                  <label>Phone</label>
                  <input value={config.invoiceContactPhone} onChange={(e) => set('invoiceContactPhone', e.target.value)} />
                </div>
                <div className="field" style={{ margin: 0 }}>
                  <label>Payment terms</label>
                  <input
                    type="number" min={0} max={365}
                    value={config.invoicePaymentTermsDays}
                    onChange={(e) => set('invoicePaymentTermsDays', Math.max(0, Math.min(365, Number(e.target.value) || 0)))}
                  />
                  <span className="field-hint">Days from the invoice date until payment is due. 0 prints no due date, which is right for a shop paid at checkout.</span>
                </div>
              </div>
              {/* One switch for every document the shop prints - invoice,
                  credit note and proforma alike. An owner whose host cannot run
                  the printer switches it off once and keeps the on-screen
                  copies. */}
              <label style={checkboxRow}>
                <input type="checkbox" checked={config.invoicePdfEnabled} onChange={(e) => set('invoicePdfEnabled', e.target.checked)} />
                Offer PDF downloads
              </label>
              <label style={checkboxRow}>
                <input
                  type="checkbox"
                  checked={config.invoiceAttachToEmail}
                  disabled={!config.invoicePdfEnabled}
                  onChange={(e) => set('invoiceAttachToEmail', e.target.checked)}
                />
                Attach the invoice to the &ldquo;your order is complete&rdquo; email
              </label>

            </>
          )}

          {config.invoicesEnabled && (
            <>
              <hr style={hr} />
              <h3 style={sectionHeading}>Invoice wording</h3>
              <p style={{ margin: '0 0 var(--space-3)', color: 'var(--color-text-secondary)', fontSize: 'var(--text-sm)' }}>
                Copied onto each invoice as it is raised, so editing these never rewrites paperwork already sent out.
              </p>
              <div style={fieldGrid}>
                <div className="field" style={{ margin: 0 }}>
                  <label>Heading</label>
                  <input value={config.invoiceHeading} onChange={(e) => set('invoiceHeading', e.target.value)} placeholder="Invoice" />
                </div>
                <div className="field" style={{ margin: 0 }}>
                  <label>What the tax row is called</label>
                  <input value={config.invoiceTaxLabel} onChange={(e) => set('invoiceTaxLabel', e.target.value)} placeholder="VAT" />
                </div>
              </div>
              <div className="field">
                <label>Opening line</label>
                <textarea rows={2} value={config.invoiceIntro} onChange={(e) => set('invoiceIntro', e.target.value)} />
              </div>
              <div className="field">
                <label>How to pay</label>
                <textarea rows={3} value={config.invoicePaymentDetails} onChange={(e) => set('invoicePaymentDetails', e.target.value)} placeholder="Bank transfer to Example Bank, sort code 00-00-00, account 12345678." />
              </div>
              <div className="field">
                <label>Terms</label>
                <textarea rows={3} value={config.invoiceTerms} onChange={(e) => set('invoiceTerms', e.target.value)} placeholder="Payment due within 30 days. Goods remain our property until paid for in full." />
              </div>
              <div className="field">
                <label>Footer line</label>
                <input value={config.invoiceFooter} onChange={(e) => set('invoiceFooter', e.target.value)} />
              </div>

              <hr style={hr} />
              <h3 style={sectionHeading}>Who can see it</h3>
              <label style={checkboxRow}>
                <input type="checkbox" checked={config.invoiceShowToCustomer} onChange={(e) => set('invoiceShowToCustomer', e.target.checked)} />
                Show it to the customer on their own order page
              </label>
              <div className="field">
                <label>PDF filename prefix</label>
                <input value={config.invoicePdfFilenamePrefix} onChange={(e) => set('invoicePdfFilenamePrefix', e.target.value)} />
                <span className="field-hint">Saves as {config.invoicePdfFilenamePrefix || 'invoice'}-{config.invoiceNumberPrefix || 'INV-'}000123.pdf.</span>
              </div>

              <hr style={hr} />
              <h3 style={sectionHeading}>Credit notes</h3>
              <p style={{ margin: '0 0 var(--space-3)', color: 'var(--color-text-secondary)', fontSize: 'var(--text-sm)' }}>
                When you refund something, the invoice you already sent is out of date and the tax on the
                refunded part is no longer yours to hand over. A credit note is the document that says so.
                It uses the same design as your invoice, so there is nothing else to lay out.
              </p>
              <label style={checkboxRow}>
                <input type="checkbox" checked={config.creditNotesEnabled} onChange={(e) => set('creditNotesEnabled', e.target.checked)} />
                Raise a credit note whenever a refund goes through
              </label>
              {config.creditNotesEnabled && (
                <>
                  <div className="field">
                    <label>Number prefix</label>
                    <input value={config.creditNoteNumberPrefix} onChange={(e) => set('creditNoteNumberPrefix', e.target.value)} />
                    <span className="field-hint">
                      Credit notes are numbered separately from invoices, so {config.creditNoteNumberPrefix || 'CN-'}000001 onwards.
                    </span>
                  </div>
                  <div className="field">
                    <label>Heading</label>
                    <input value={config.creditNoteHeading} onChange={(e) => set('creditNoteHeading', e.target.value)} />
                  </div>
                  <div className="field">
                    <label>Wording under the total</label>
                    <textarea rows={2} value={config.creditNoteWording} onChange={(e) => set('creditNoteWording', e.target.value)} />
                  </div>
                  <label style={checkboxRow}>
                    <input type="checkbox" checked={config.creditNoteEmailCustomer} onChange={(e) => set('creditNoteEmailCustomer', e.target.checked)} />
                    Email the customer a copy
                  </label>
                  <div className="field">
                    <label>PDF filename prefix</label>
                    <input value={config.creditNotePdfFilenamePrefix} onChange={(e) => set('creditNotePdfFilenamePrefix', e.target.value)} />
                    <span className="field-hint">
                      Saves as {config.creditNotePdfFilenamePrefix || 'credit-note'}-{config.creditNoteNumberPrefix || 'CN-'}000123.pdf.
                    </span>
                  </div>
                </>
              )}
            </>
          )}

          {config.proformaEnabled && (
            <>
              <hr style={hr} />
              <h3 style={sectionHeading}>Proforma invoices</h3>
              <p style={{ margin: '0 0 var(--space-3)', color: 'var(--color-text-secondary)', fontSize: 'var(--text-sm)' }}>
                Sent on any order nobody has been paid for yet - bank transfer, cash, and anything else settled by
                hand. It says what is owed, how to pay it and how long each item takes once the money lands, and it
                is numbered with the order number rather than an invoice number, because it is not an invoice. Plenty
                of buyers&rsquo; accounts departments will not release a payment without one. What it looks like is
                designed under Appearance &gt; Layouts, as the &ldquo;Proforma document&rdquo; layout.
              </p>
              <div className="field">
                <label>Heading</label>
                <input value={config.proformaHeading} onChange={(e) => set('proformaHeading', e.target.value)} placeholder="Proforma invoice" />
              </div>
              <div className="field">
                <label>The line that says it is not a VAT invoice</label>
                <textarea rows={2} value={config.proformaNotice} onChange={(e) => set('proformaNotice', e.target.value)} />
                <span className="field-hint">
                  Printed in the panel at the top. Worth keeping: a proforma that reads like an invoice is one
                  somebody will try to reclaim the {config.invoiceTaxLabel || 'VAT'} on.
                </span>
              </div>
              <div className="field">
                <label>Terms, while it is still unpaid</label>
                <textarea rows={3} value={config.proformaTerms} onChange={(e) => set('proformaTerms', e.target.value)} />
                <span className="field-hint">
                  Once the money arrives the document switches to your invoice terms above.
                </span>
              </div>
              <div style={fieldGrid}>
                <div className="field" style={{ margin: 0 }}>
                  <label>Line under the total, unpaid</label>
                  <input value={config.proformaUnpaidWording} onChange={(e) => set('proformaUnpaidWording', e.target.value)} />
                </div>
                <div className="field" style={{ margin: 0 }}>
                  <label>Line under the total, once paid</label>
                  <input value={config.proformaPaidWording} onChange={(e) => set('proformaPaidWording', e.target.value)} />
                </div>
              </div>
              <p style={{ margin: '0 0 var(--space-3)', color: 'var(--color-text-secondary)', fontSize: 'var(--text-sm)' }}>
                Where to send the money comes from whatever you have written for that payment method on the
                Payments tab, so the proforma, the thank-you page and the email all quote the same account details.
              </p>
              <label style={checkboxRow}>
                <input type="checkbox" checked={config.proformaShowToCustomer} onChange={(e) => set('proformaShowToCustomer', e.target.checked)} />
                Give the customer a link on the thank-you page and their own order page
              </label>
              <label style={checkboxRow}>
                <input type="checkbox" checked={config.proformaAttachToEmail} onChange={(e) => set('proformaAttachToEmail', e.target.checked)} />
                Attach it to the &ldquo;we have your order, here is how to pay&rdquo; email
              </label>
              <div className="field">
                <label>PDF filename prefix</label>
                <input value={config.proformaPdfFilenamePrefix} onChange={(e) => set('proformaPdfFilenamePrefix', e.target.value)} />
                <span className="field-hint">Saves as {config.proformaPdfFilenamePrefix || 'proforma'}-{config.orderNumberPrefix || 'ORD-'}000123.pdf.</span>
              </div>
            </>
          )}
        </div>
      )}

      {subTab === 'notifications' && (
        <div>
          <p style={{ margin: '0 0 var(--space-4)', color: 'var(--color-text-secondary)', fontSize: 'var(--text-sm)' }}>
            Who gets told, and when. What the emails actually say - and the design wrapped around them -
            lives with every other email on the site, under Settings, on the Emails tab.
          </p>
          <div className="field">
            <label>Admin order alert email</label>
            <input type="email" value={config.adminOrderAlertEmail} onChange={(e) => set('adminOrderAlertEmail', e.target.value)} />
            <span className="field-hint">Sent every time a new order comes in.</span>
          </div>
          <label style={checkboxRow}>
            <input type="checkbox" checked={config.lowStockAlertEnabled} onChange={(e) => set('lowStockAlertEnabled', e.target.checked)} />
            Send low stock alerts
          </label>
          <div className="field">
            <label>Low stock alert email</label>
            <input type="email" value={config.lowStockAlertEmail} onChange={(e) => set('lowStockAlertEmail', e.target.value)} />
          </div>

          {/* Rendered by the core config page, so shop hands it the space and
              asks nothing else about it. Its own fetch, its own save, its own
              permission check - all its module's business, not shop's. */}
          {hostedSettingsSlots?.[HOSTED_NOTIFICATIONS_SLOT]}
        </div>
      )}

      {/* Rendered by the core config page, so shop hands it the space and asks
          nothing else about it. Whatever the panel needs - its own fetch, its own
          save, its own permission check - is its own module's business. */}
      {activeHostedSubTab && <div>{activeHostedSubTab.node}</div>}
    </div>
  )
}
