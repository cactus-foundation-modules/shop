// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { OrderDetailScreen } from './OrderDetailScreen'

vi.mock('./use-currency-symbol', () => ({ useCurrencySymbol: () => '£' }))
vi.mock('./RefundModal', () => ({ RefundModal: () => <div>Refund form</div> }))
vi.mock('./DispatchModal', () => ({ DispatchModal: () => <div>Dispatch form</div> }))
vi.mock('./EditParcelModal', () => ({ EditParcelModal: () => null }))
vi.mock('./EmailCustomerModal', () => ({ EmailCustomerModal: () => <div>Email form</div> }))
vi.mock('./ReplacementModal', () => ({ ReplacementModal: () => <div>Replacement form</div> }))

let host: HTMLDivElement
let root: Root
let pending = false
let manualPayment = false
const order = {
  id: 'order-1', orderNumber: '1001', status: 'PROCESSING', paymentStatus: 'PAID',
  paymentMethod: 'BANK_TRANSFER', customerName: 'Alex Customer', customerEmail: 'alex@example.test',
  customerReference: 'PO-123', subtotal: '100', discountAmount: '0', shippingAmount: '10',
  taxAmount: '22', total: '132', taxMode: 'EXCLUSIVE', currency: 'GBP',
  shippingAddress: { line1: '1 Example Street', city: 'York', postcode: 'YO1 1AA', country: 'GB' },
  deliveryInstructions: 'Use the side entrance', createdAt: '2026-09-01T12:00:00Z',
}

beforeEach(() => {
  pending = false
  manualPayment = false
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const body = url.endsWith('/charges') ? {
      charges: pending ? [{ id: 'fee-1', status: 'PENDING', reason: 'Redelivery', total: '24', netAmount: '20', taxAmount: '4', taxRate: '20', cancellationTotal: '0', createdAt: order.createdAt }] : [],
      payMethods: [], taxLabel: 'VAT', suggestedTaxRate: 20,
    } : url.endsWith('/dispatch') ? {
      summary: { lines: [{ orderItemId: 'item-1', quantity: 1, dispatchedQty: 0, outstandingQty: 1 }], fullyDispatched: false },
      shipments: [], couriers: [], preOrderHold: { active: false },
    } : url.endsWith('/invoice') ? { enabled: true, invoices: [], issueOn: 'MANUAL' }
      : url.endsWith('/credit-note') ? { enabled: false, creditNotes: [] }
        : { order: { ...order, paymentStatus: manualPayment ? 'AWAITING_CONFIRMATION' : 'PAID' }, items: [{ id: 'item-1', productName: 'Office desk', productType: 'PHYSICAL', quantity: 1, unitPrice: '100', total: '100', taxAmount: '20', taxRate: '20', refundedQty: 0 }],
          notes: [], emails: [], refunds: [], refundItems: [], downloads: [], authors: {}, customer: { orderCount: 1, totalSpent: '132' } }
    return { ok: true, json: async () => body }
  }))
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})
afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
  vi.unstubAllGlobals()
})
async function render() {
  await act(async () => root.render(<OrderDetailScreen orderId="order-1"><div>Supplier purchase orders</div></OrderDetailScreen>))
}
async function click(label: string) {
  const button = [...host.querySelectorAll('button')].find((el) => el.textContent === label)
  expect(button, label).toBeTruthy()
  await act(async () => button!.click())
}
function panel(id: string) { return host.querySelector<HTMLElement>(`#order-${id}`)! }

describe('Order workspace', () => {
  it('leads with the actual total and keeps exceptional delivery fees off the overview', async () => {
    await render()
    expect(host.querySelector('.sod-summary')?.textContent).toContain('£132.00')
    expect(host.querySelector('.sod-summary')?.compareDocumentPosition(panel('delivery'))).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
    expect(panel('overview').hidden).toBe(false)
    expect(panel('overview').textContent).toContain('Supplier purchase orders')
    expect(panel('overview').textContent).toContain('Totals')
    expect(panel('overview').textContent).not.toContain('Redelivery charge')
    expect(panel('delivery').hidden).toBe(true)
    expect(host.querySelector('.sod-inspector')?.textContent).toContain('PO-123')
  })
  it('groups delivery, documents and notes while preserving a drafted note', async () => {
    await render()
    await click('Delivery')
    expect(panel('delivery').hidden).toBe(false)
    expect(panel('delivery').textContent).toContain('Use the side entrance')
    expect(panel('delivery').textContent).toContain('No parcels recorded yet')
    await click('Payment & documents')
    expect(panel('payment').hidden).toBe(false)
    expect(panel('payment').textContent).toContain('Invoice')
    await click('Activity')
    const draft = host.querySelector<HTMLTextAreaElement>('textarea[aria-label="Add a note to this order"]')!
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(draft, 'Call before delivery')
      draft.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await click('Overview')
    await click('Activity')
    expect(draft.value).toBe('Call before delivery')
    expect(host.querySelector('[aria-current="page"]')?.textContent).toBe('Activity')
  })
  it('surfaces an outstanding charge and takes staff straight to it', async () => {
    pending = true
    await render()
    expect(host.textContent).toContain('A redelivery charge is awaiting payment')
    await click('Review charge')
    expect(panel('delivery').hidden).toBe(false)
    expect(panel('delivery').textContent).toContain('Record as paid')
  })
  it('puts manual payment confirmation in the main toolbar only when payment is outstanding', async () => {
    manualPayment = true
    await render()
    expect(host.querySelector('.sox-orderhead-actions')?.textContent).toContain('Payment received')
    expect(host.querySelector('.sod-inspector')?.textContent).not.toContain('Payment received')
  })
  it('retains dispatch and exceptional actions without making them the headline', async () => {
    await render()
    expect(host.querySelector('.sod-more')?.textContent).toContain('Send a replacement')
    expect(host.querySelector('.sod-more')?.textContent).toContain('Refund')
    expect(host.querySelector('.sox-orderhead-actions')?.textContent).not.toContain('Payment received')
    await click('Dispatch items')
    expect(host.textContent).toContain('Dispatch form')
  })
})
