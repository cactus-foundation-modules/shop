import type { SmsTemplateDef } from '@/lib/sms/registry'

// The shop's text messages, declared for core's text message registry (see the
// manifest's `smsTemplates` entry). The wording is edited wherever the site's
// SMS provider module puts its editor - with Twilio installed, that is
// Settings > Twilio > Templates.
//
// One text per customer-facing order milestone, and no more than that. The
// admin alerts, the low-stock warnings and the import summaries stay email-only
// on purpose: they are for the owner, who is sitting at a screen, and a text
// message costs money per send.
//
// House style for the copy: shop name first so the message is identifiable
// before it is opened, one fact, and no link unless the shopper genuinely needs
// one. Keeping every default inside 160 characters keeps it to one segment,
// which is the difference between a penny and tuppence a message.
//
// Keys must all start with `shop.` - core rejects a module claiming a key
// outside its own namespace.

export const shopSmsTemplates: SmsTemplateDef[] = [
  {
    key: 'shop.order-confirmed',
    label: 'Order confirmed',
    body: '{{shopName}}: thanks {{customerName}}, order {{orderNumber}} is confirmed. Total {{orderTotal}}. We will text you when it is on its way.',
    mergeTags: ['shopName', 'customerName', 'orderNumber', 'orderTotal'],
    requiredTags: ['orderNumber'],
    transactional: false,
  },
  {
    // Placed but not paid for. No bank details in a text - they are long, they
    // are exactly the thing somebody mistypes off a phone screen, and the email
    // has them - so this only points at the email.
    key: 'shop.order-placed-unpaid',
    label: 'Order placed (payment still to come)',
    body: '{{shopName}}: thanks {{customerName}}, we have order {{orderNumber}}. It goes out once your payment of {{orderTotal}} reaches us - see your email for how to pay.',
    mergeTags: ['shopName', 'customerName', 'orderNumber', 'orderTotal'],
    requiredTags: ['orderNumber'],
    transactional: true,
  },
  {
    // The bank-transfer and cash counterpart of the one above, for the moment
    // the money is cleared by hand rather than by a card provider.
    key: 'shop.payment-received',
    label: 'Payment received',
    body: '{{shopName}}: thanks {{customerName}}, we have received your payment of {{orderTotal}} for order {{orderNumber}}. We are getting it ready now.',
    mergeTags: ['shopName', 'customerName', 'orderNumber', 'orderTotal'],
    requiredTags: ['orderNumber'],
    transactional: true,
  },
  {
    key: 'shop.status-processing',
    label: 'Order processing',
    body: '{{shopName}}: order {{orderNumber}} is being processed. We will let you know as soon as it is dispatched.',
    mergeTags: ['shopName', 'customerName', 'orderNumber'],
    requiredTags: ['orderNumber'],
    transactional: false,
  },
  {
    key: 'shop.status-shipped',
    label: 'Order dispatched',
    body: '{{shopName}}: order {{orderNumber}} is on its way.',
    mergeTags: ['shopName', 'customerName', 'orderNumber'],
    requiredTags: ['orderNumber'],
    transactional: false,
  },
  {
    key: 'shop.status-completed',
    label: 'Order completed',
    body: '{{shopName}}: order {{orderNumber}} is complete. Thanks for shopping with us.',
    mergeTags: ['shopName', 'customerName', 'orderNumber'],
    requiredTags: ['orderNumber'],
    transactional: false,
  },
  {
    key: 'shop.status-cancelled',
    label: 'Order cancelled',
    body: '{{shopName}}: order {{orderNumber}} has been cancelled. Get in touch if that is news to you.',
    mergeTags: ['shopName', 'customerName', 'orderNumber'],
    requiredTags: ['orderNumber'],
    transactional: false,
  },
  {
    key: 'shop.partial-shipped',
    label: 'Part of an order dispatched',
    body: '{{shopName}}: part of order {{orderNumber}} is on its way.{{#if hasOutstanding}} The rest is still with us and we will text again when it goes.{{/if}}{{#if hasTracking}} Tracking: {{trackingNumber}}{{/if}}',
    mergeTags: ['shopName', 'customerName', 'orderNumber', 'carrier', 'trackingNumber'],
    requiredTags: ['orderNumber'],
    transactional: false,
  },
  {
    key: 'shop.request-received',
    label: 'Cancel or return request received',
    body: '{{shopName}}: we have your {{requestType}} request for order {{orderNumber}} and will be in touch shortly.',
    mergeTags: ['shopName', 'customerName', 'orderNumber', 'requestType'],
    requiredTags: ['orderNumber'],
    transactional: false,
  },
  {
    key: 'shop.request-approved',
    label: 'Cancel or return request approved',
    body: '{{shopName}}: your {{requestType}} request for order {{orderNumber}} has been approved. Check your email for the details.',
    mergeTags: ['shopName', 'customerName', 'orderNumber', 'requestType'],
    requiredTags: ['orderNumber'],
    transactional: false,
  },
  {
    key: 'shop.request-declined',
    label: 'Cancel or return request declined',
    body: '{{shopName}}: we could not approve your {{requestType}} request for order {{orderNumber}}. Check your email for why.',
    mergeTags: ['shopName', 'customerName', 'orderNumber', 'requestType'],
    requiredTags: ['orderNumber'],
    transactional: false,
  },
]

// Same trigger vocabulary as the emails, so a call site that sends both names
// the milestone once. A trigger missing from here simply has no text message -
// the admin alerts, for one.
export const SHOP_TRIGGER_TO_SMS_KEY: Record<string, string> = {
  ORDER_CONFIRMED: 'shop.order-confirmed',
  ORDER_PLACED_UNPAID: 'shop.order-placed-unpaid',
  PAYMENT_RECEIVED: 'shop.payment-received',
  STATUS_PROCESSING: 'shop.status-processing',
  STATUS_SHIPPED: 'shop.status-shipped',
  STATUS_COMPLETED: 'shop.status-completed',
  STATUS_CANCELLED: 'shop.status-cancelled',
  PARTIAL_SHIPPED: 'shop.partial-shipped',
  REQUEST_RECEIVED: 'shop.request-received',
  REQUEST_APPROVED: 'shop.request-approved',
  REQUEST_DECLINED: 'shop.request-declined',
}

/** The category a member's own notification preferences are kept under (see the
 * manifest's memberExtensions.notificationCategories). */
export const SHOP_ORDER_UPDATES_CATEGORY = 'shop:order-updates'
