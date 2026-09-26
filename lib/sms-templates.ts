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
// `orderUrl` is on every one of them, filled in by notifyOrderCustomer the same
// way it is for the emails: the tracking link, which asks a stranger for the
// delivery postcode and sends the customer who is signed in and owns the order
// straight to their own order page. It is deliberately not in any default
// wording - it is the best part of ninety characters, so on most of these it is
// the difference between one segment and two, and that is the owner's call to
// make in the editor rather than ours to make for every shop.
//
// It comes back empty on a shop with guest order tracking switched off, which
// is what `hasOrderUrl` is for: wrap the line in {{#if hasOrderUrl}} ... {{/if}}
// and it takes the whole line with it rather than leaving "Track it:" dangling.
//
// Keys must all start with `shop.` - core rejects a module claiming a key
// outside its own namespace.

export const shopSmsTemplates: SmsTemplateDef[] = [
  {
    key: 'shop.order-confirmed',
    label: 'Order confirmed',
    body: '{{shopName}}: thanks {{customerName}}, order {{orderNumber}} is confirmed. Total {{orderTotal}}. We will text you when it is on its way.',
    mergeTags: ['shopName', 'customerName', 'orderNumber', 'orderTotal', 'orderUrl', 'hasOrderUrl'],
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
    mergeTags: ['shopName', 'customerName', 'orderNumber', 'orderTotal', 'orderUrl', 'hasOrderUrl'],
    requiredTags: ['orderNumber'],
    transactional: true,
  },
  {
    // The bank-transfer and cash counterpart of the one above, for the moment
    // the money is cleared by hand rather than by a card provider.
    key: 'shop.payment-received',
    label: 'Payment received',
    body: '{{shopName}}: thanks {{customerName}}, we have received your payment of {{orderTotal}} for order {{orderNumber}}. We are getting it ready now.',
    mergeTags: ['shopName', 'customerName', 'orderNumber', 'orderTotal', 'orderUrl', 'hasOrderUrl'],
    requiredTags: ['orderNumber'],
    transactional: true,
  },
  {
    key: 'shop.status-processing',
    label: 'Order processing',
    body: '{{shopName}}: order {{orderNumber}} is being processed. We will let you know as soon as it is dispatched.',
    mergeTags: ['shopName', 'customerName', 'orderNumber', 'orderUrl', 'hasOrderUrl'],
    requiredTags: ['orderNumber'],
    transactional: false,
  },
  {
    key: 'shop.status-shipped',
    label: 'Order dispatched',
    body: '{{shopName}}: order {{orderNumber}} is on its way.',
    mergeTags: ['shopName', 'customerName', 'orderNumber', 'orderUrl', 'hasOrderUrl'],
    requiredTags: ['orderNumber'],
    transactional: false,
  },
  {
    key: 'shop.status-completed',
    label: 'Order completed',
    body: '{{shopName}}: order {{orderNumber}} is complete. Thanks for shopping with us.',
    mergeTags: ['shopName', 'customerName', 'orderNumber', 'orderUrl', 'hasOrderUrl', 'hasReviewRequest'],
    requiredTags: ['orderNumber'],
    transactional: false,
  },
  {
    key: 'shop.status-cancelled',
    label: 'Order cancelled',
    body: '{{shopName}}: order {{orderNumber}} has been cancelled. Get in touch if that is news to you.',
    mergeTags: ['shopName', 'customerName', 'orderNumber', 'orderUrl', 'hasOrderUrl'],
    requiredTags: ['orderNumber'],
    transactional: false,
  },
  {
    key: 'shop.partial-shipped',
    label: 'Part of an order dispatched',
    body: '{{shopName}}: part of order {{orderNumber}} is on its way.{{#if hasOutstanding}} The rest is still with us and we will text again when it goes.{{/if}}{{#if hasTracking}} Tracking: {{trackingNumber}}{{/if}}',
    // Both flags are declared, not just used: an undeclared one is never given
    // a stand-in value, so Preview quietly dropped two of the three sentences
    // this message ships with and the owner was left editing wording they
    // could not see. The sender fills them in either way - see
    // lib/shipment-email.ts, which also passes isFinalPart, hasCarrier and
    // trackingUrl for anyone who wants to write with them.
    mergeTags: ['shopName', 'customerName', 'orderNumber', 'carrier', 'trackingNumber', 'hasOutstanding', 'hasTracking', 'orderUrl', 'hasOrderUrl'],
    requiredTags: ['orderNumber'],
    transactional: false,
  },
  {
    key: 'shop.request-received',
    label: 'Cancel or return request received',
    body: '{{shopName}}: we have your {{requestType}} request for order {{orderNumber}} and will be in touch shortly.',
    mergeTags: ['shopName', 'customerName', 'orderNumber', 'requestType', 'orderUrl', 'hasOrderUrl'],
    requiredTags: ['orderNumber'],
    transactional: false,
  },
  {
    key: 'shop.request-approved',
    label: 'Cancel or return request approved',
    body: '{{shopName}}: your {{requestType}} request for order {{orderNumber}} has been approved. Check your email for the details.',
    mergeTags: ['shopName', 'customerName', 'orderNumber', 'requestType', 'orderUrl', 'hasOrderUrl'],
    requiredTags: ['orderNumber'],
    transactional: false,
  },
  {
    key: 'shop.request-declined',
    label: 'Cancel or return request declined',
    body: '{{shopName}}: we could not approve your {{requestType}} request for order {{orderNumber}}. Check your email for why.',
    mergeTags: ['shopName', 'customerName', 'orderNumber', 'requestType', 'orderUrl', 'hasOrderUrl'],
    requiredTags: ['orderNumber'],
    transactional: false,
  },
  // Damage. All three stages get one, unlike the request pair above, and for a
  // reason that only shows up on somebody who takes texts and not emails: they
  // have told us something arrived broken, and silence is not an answer to
  // leave them with. Each says enough to stand on its own.
  {
    key: 'shop.damage-received',
    label: 'Damage reported',
    body: '{{shopName}}: thanks for telling us about order {{orderNumber}} - sorry about that. We have your report and photographs, and will be in touch shortly.',
    mergeTags: ['shopName', 'customerName', 'orderNumber', 'orderUrl', 'hasOrderUrl'],
    requiredTags: ['orderNumber'],
    transactional: false,
  },
  {
    key: 'shop.damage-resolved',
    label: 'Damage report - putting it right',
    body: '{{shopName}}: we have looked at the damage on order {{orderNumber}} and we are putting it right. The details are in your email.',
    mergeTags: ['shopName', 'customerName', 'orderNumber', 'orderUrl', 'hasOrderUrl'],
    requiredTags: ['orderNumber'],
    transactional: false,
  },
  {
    key: 'shop.damage-declined',
    label: 'Damage report - not something we can put right',
    body: '{{shopName}}: we have looked at the damage reported on order {{orderNumber}} and it is not something we can put right. Get in touch if you think we have missed something.',
    mergeTags: ['shopName', 'customerName', 'orderNumber', 'orderUrl', 'hasOrderUrl'],
    requiredTags: ['orderNumber'],
    transactional: false,
  },
  // Replacements. Both name the ORIGINAL order, because that is the number the
  // customer knows - the replacement's own is one they have never seen, and
  // leading with it in 160 characters is a text nobody can make sense of.
  {
    key: 'shop.replacement-sent',
    label: 'Replacement on its way',
    body: '{{shopName}}: sorry about order {{parentOrderNumber}}. A replacement is being prepared and we will text you again when it leaves us.',
    mergeTags: ['shopName', 'customerName', 'orderNumber', 'parentOrderNumber', 'parentOrderUrl', 'orderUrl', 'hasOrderUrl', 'hasParentOrderUrl'],
    requiredTags: ['parentOrderNumber'],
    transactional: false,
  },
  {
    key: 'shop.replacement-dispatched',
    label: 'Replacement dispatched',
    body: '{{shopName}}: your replacement for order {{parentOrderNumber}} has left us.{{#if hasTracking}} Tracking: {{trackingNumber}}.{{/if}}{{#if hasOrderUrl}} Follow it: {{orderUrl}}{{/if}}',
    mergeTags: ['shopName', 'customerName', 'orderNumber', 'parentOrderNumber', 'parentOrderUrl', 'trackingNumber', 'hasTracking', 'orderUrl', 'hasOrderUrl', 'hasParentOrderUrl'],
    requiredTags: ['parentOrderNumber'],
    transactional: false,
  },
  {
    key: 'shop.tracking-added',
    label: 'Tracking added after dispatch',
    body: '{{shopName}}: tracking for order {{orderNumber}}{{#if hasCarrier}} with {{carrier}}{{/if}}{{#if hasTrackingNumber}}: {{trackingNumber}}{{/if}}.{{#if hasTrackingUrl}} {{trackingUrl}}{{/if}}',
    mergeTags: ['shopName', 'customerName', 'orderNumber', 'carrier', 'trackingNumber', 'trackingUrl', 'hasCarrier', 'hasTrackingNumber', 'hasTrackingUrl', 'orderUrl', 'hasOrderUrl'],
    requiredTags: ['orderNumber'],
    transactional: false,
  },
  {
    key: 'shop.replacement-tracking-added',
    label: 'Replacement - tracking added after dispatch',
    body: '{{shopName}}: tracking for your replacement from order {{parentOrderNumber}}{{#if hasTrackingNumber}}: {{trackingNumber}}{{/if}}.{{#if hasTrackingUrl}} {{trackingUrl}}{{/if}}',
    mergeTags: ['shopName', 'customerName', 'orderNumber', 'parentOrderNumber', 'parentOrderUrl', 'carrier', 'trackingNumber', 'trackingUrl', 'hasCarrier', 'hasTrackingNumber', 'hasTrackingUrl', 'orderUrl', 'hasOrderUrl', 'hasParentOrderUrl'],
    requiredTags: ['parentOrderNumber'],
    transactional: false,
  },
  {
    key: 'shop.replacement-delivered',
    label: 'Replacement delivered',
    body: '{{shopName}}: your replacement for order {{parentOrderNumber}} has been delivered{{#if hasSignedBy}}, signed for by {{signedBy}}{{/if}}. If anything is still not right, get in touch.',
    mergeTags: ['shopName', 'customerName', 'orderNumber', 'parentOrderNumber', 'parentOrderUrl', 'signedBy', 'hasSignedBy', 'orderUrl', 'hasOrderUrl', 'hasParentOrderUrl'],
    requiredTags: ['parentOrderNumber'],
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
  DAMAGE_RECEIVED: 'shop.damage-received',
  DAMAGE_RESOLVED: 'shop.damage-resolved',
  DAMAGE_DECLINED: 'shop.damage-declined',
  REPLACEMENT_SENT: 'shop.replacement-sent',
  REPLACEMENT_DISPATCHED: 'shop.replacement-dispatched',
  REPLACEMENT_DELIVERED: 'shop.replacement-delivered',
  TRACKING_ADDED: 'shop.tracking-added',
  REPLACEMENT_TRACKING_ADDED: 'shop.replacement-tracking-added',
}

/** The category a member's own notification preferences are kept under (see the
 * manifest's memberExtensions.notificationCategories). */
export const SHOP_ORDER_UPDATES_CATEGORY = 'shop:order-updates'
