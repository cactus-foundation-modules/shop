import type { EmailTemplateDef } from '@/lib/email/registry'

// The shop's emails, declared for core's single email editor (Settings >
// Emails). Core owns the copy overrides, the on/off switch, the wrapper design
// and the sending; this file is only the defaults and what may be merged in.
//
// These were previously rows in shp_email_templates, seeded by migration and
// edited on a Shop-only settings tab. Migration 014 lifts any wording an owner
// had already changed across to core's EmailTemplate table; the old table stays
// where it is, unread, rather than being dropped out from under a rollback.
//
// Keys must all start with `shop.` - core rejects a module claiming a key
// outside its own namespace, which is what stops two modules quietly fighting
// over the same email.

export const shopEmailTemplates: EmailTemplateDef[] = [
  {
    key: 'shop.order-confirmed',
    label: 'Order confirmed',
    subject: 'Your order {{orderNumber}} is confirmed',
    bodyHtml:
      "<p>Hi {{customerName}},</p><p>Thanks for your order <strong>{{orderNumber}}</strong> - we're getting it ready.</p><p>{{orderItems}}</p><p>Total: {{orderTotal}}</p>{{#if hasPreOrderItems}}<p>Pre-order notice: your order contains a pre-order item ({{preOrderItemName}}), expected to dispatch on or before {{preOrderDispatchDate}}.</p>{{/if}}<p>Shipping to: {{shippingAddress}}</p>",
    mergeTags: ['customerName', 'orderNumber', 'orderItems', 'orderTotal', 'shippingAddress', 'preOrderItemName', 'preOrderDispatchDate', 'shopName'],
    transactional: false,
  },
  {
    key: 'shop.status-processing',
    label: 'Order processing',
    subject: 'Your order {{orderNumber}} is being processed',
    bodyHtml: '<p>Hi {{customerName}},</p><p>Your order <strong>{{orderNumber}}</strong> is now being processed.</p>',
    mergeTags: ['customerName', 'orderNumber', 'shopName'],
    transactional: false,
  },
  {
    key: 'shop.status-shipped',
    label: 'Order shipped',
    subject: 'Your order {{orderNumber}} is on its way',
    bodyHtml: '<p>Hi {{customerName}},</p><p>Your order <strong>{{orderNumber}}</strong> is on its way.</p>',
    mergeTags: ['customerName', 'orderNumber', 'shopName'],
    transactional: false,
  },
  {
    key: 'shop.status-completed',
    label: 'Order completed',
    subject: 'Your order {{orderNumber}} is complete',
    bodyHtml: '<p>Hi {{customerName}},</p><p>Your order <strong>{{orderNumber}}</strong> is now complete. Thanks for shopping with us.</p>',
    mergeTags: ['customerName', 'orderNumber', 'shopName'],
    transactional: false,
  },
  {
    key: 'shop.status-cancelled',
    label: 'Order cancelled',
    subject: 'Your order {{orderNumber}} has been cancelled',
    bodyHtml: '<p>Hi {{customerName}},</p><p>Your order <strong>{{orderNumber}}</strong> has been cancelled.</p>',
    mergeTags: ['customerName', 'orderNumber', 'shopName'],
    transactional: false,
  },
  {
    key: 'shop.partial-shipped',
    label: 'Part of an order dispatched',
    subject: '{{#if hasOutstanding}}Part of your order {{orderNumber}} is on its way{{/if}}{{#if isFinalPart}}The last part of your order {{orderNumber}} is on its way{{/if}}',
    bodyHtml:
      '<p>Hi {{customerName}},</p>{{#if hasOutstanding}}<p>Good news - part of your order <strong>{{orderNumber}}</strong> is on its way. The rest of it is still with us, and we will email you again as soon as it is dispatched.</p>{{/if}}{{#if isFinalPart}}<p>Good news - the last part of your order <strong>{{orderNumber}}</strong> is on its way. That is everything from this order now dispatched.</p>{{/if}}<p><strong>In this parcel:</strong></p><p>{{dispatchedItems}}</p>{{#if hasOutstanding}}<p><strong>Still to come:</strong></p><p>{{outstandingItems}}</p>{{/if}}{{#if hasCarrier}}<p>Sent with {{carrier}}.</p>{{/if}}{{#if hasTracking}}<p>Tracking number: {{trackingNumber}}</p>{{/if}}<p>Parcels sent separately can arrive a day or two apart, so please do not worry if they turn up at different times.</p><p>Thanks for shopping with {{shopName}}.</p>',
    mergeTags: ['customerName', 'orderNumber', 'dispatchedItems', 'outstandingItems', 'carrier', 'trackingNumber', 'shopName'],
    transactional: false,
  },
  {
    key: 'shop.admin-new-order',
    label: 'New order (admin alert)',
    subject: 'New order received: {{orderNumber}}',
    bodyHtml: '<p>New order <strong>{{orderNumber}}</strong> from {{customerName}} ({{customerEmail}}).</p><p>Total: {{orderTotal}}</p>',
    mergeTags: ['orderNumber', 'customerName', 'customerEmail', 'orderTotal', 'shopName'],
    transactional: false,
  },
  {
    key: 'shop.low-stock',
    label: 'Low stock (admin alert)',
    subject: 'Low stock alert: {{productName}}',
    bodyHtml: '<p>{{productName}} is running low on stock ({{stockCount}} remaining).</p>',
    mergeTags: ['productName', 'stockCount', 'shopName'],
    transactional: false,
  },
  {
    key: 'shop.back-in-stock',
    label: 'Back in stock',
    subject: '{{productName}} is back in stock',
    bodyHtml:
      '<p>Good news - {{productName}} is back in stock.</p><p><a href="{{productUrl}}">View product</a></p><p><a href="{{unsubscribeUrl}}">Unsubscribe from this alert</a></p>',
    mergeTags: ['productName', 'productUrl', 'unsubscribeUrl', 'shopName'],
    // Without the unsubscribe link this is an alert nobody can get out of, so
    // it is the one shop email an edit is not allowed to strip.
    requiredTags: ['unsubscribeUrl'],
    transactional: false,
  },
  {
    key: 'shop.import-complete',
    label: 'Import complete (admin alert)',
    subject: 'Product import complete: {{createdCount}} created, {{updatedCount}} updated',
    bodyHtml: '<p>Your product import has finished.</p><p>Created: {{createdCount}}, Updated: {{updatedCount}}, Skipped: {{skippedCount}}.</p>',
    mergeTags: ['createdCount', 'updatedCount', 'skippedCount', 'shopName'],
    transactional: false,
  },
  // Cancel and return requests. One template per stage rather than one with
  // three branches: an owner rewriting "we have your request" should not risk
  // rewording "we have said no" by accident.
  {
    key: 'shop.request-received',
    label: 'Cancel or return request received',
    subject: "We've got your {{requestType}} request for order {{orderNumber}}",
    bodyHtml:
      '<p>Hi {{customerName}},</p><p>Thanks - we have your {{requestType}} request for order <strong>{{orderNumber}}</strong> and someone will look at it shortly.</p><p>Reason given: {{requestReason}}</p>{{#if hasItems}}<p><strong>Items:</strong></p><p>{{requestItems}}</p>{{/if}}<p>We will email you as soon as there is a decision.</p>',
    mergeTags: ['customerName', 'orderNumber', 'requestType', 'requestReason', 'requestItems', 'shopName'],
    transactional: false,
  },
  {
    key: 'shop.request-approved',
    label: 'Cancel or return request approved',
    subject: 'Your {{requestType}} request for order {{orderNumber}} is approved',
    bodyHtml:
      '<p>Hi {{customerName}},</p><p>Good news - we have approved your {{requestType}} request for order <strong>{{orderNumber}}</strong>.</p>{{#if hasAdminNote}}<p>{{adminNote}}</p>{{/if}}{{#if hasRefund}}<p>A refund of {{refundAmount}} is on its way back to you. Depending on your bank it can take a few working days to show up.</p>{{/if}}<p>Thanks for your patience.</p>',
    mergeTags: ['customerName', 'orderNumber', 'requestType', 'adminNote', 'refundAmount', 'shopName'],
    transactional: false,
  },
  {
    key: 'shop.request-declined',
    label: 'Cancel or return request declined',
    subject: 'About your {{requestType}} request for order {{orderNumber}}',
    bodyHtml:
      '<p>Hi {{customerName}},</p><p>We have looked at your {{requestType}} request for order <strong>{{orderNumber}}</strong>, and unfortunately we are not able to accept it this time.</p>{{#if hasAdminNote}}<p>{{adminNote}}</p>{{/if}}<p>If you think that is wrong, reply to this email and we will take another look.</p>',
    mergeTags: ['customerName', 'orderNumber', 'requestType', 'adminNote', 'shopName'],
    transactional: false,
  },
  // A refund the buyer has no paperwork for is the next support ticket, and a
  // business buyer's own accountant will want the document rather than a line
  // on a card statement. Transactional: it is the record of money moving, not
  // marketing, so it goes out whether or not they take our newsletters.
  {
    key: 'shop.credit-note-issued',
    label: 'Credit note issued',
    subject: 'Credit note {{creditNoteNumber}} for order {{orderNumber}}',
    bodyHtml:
      '<p>Hi {{customerName}},</p><p>We have refunded {{creditAmount}} against order <strong>{{orderNumber}}</strong>, and here is the credit note for your records.</p>{{#if hasReason}}<p>Reason: {{creditReason}}</p>{{/if}}<p><a href="{{creditNoteUrl}}">View credit note {{creditNoteNumber}}</a></p><p>Depending on your bank the money can take a few working days to show up.</p>',
    mergeTags: ['customerName', 'orderNumber', 'creditNoteNumber', 'creditNoteUrl', 'creditAmount', 'creditReason', 'invoiceNumber', 'shopName'],
    transactional: true,
  },
  {
    key: 'shop.admin-new-request',
    label: 'New cancel or return request (admin alert)',
    subject: 'New {{requestType}} request: order {{orderNumber}}',
    bodyHtml:
      '<p>{{customerName}} ({{customerEmail}}) has asked for a {{requestType}} on order <strong>{{orderNumber}}</strong>.</p><p>Reason: {{requestReason}}</p>{{#if hasItems}}<p><strong>Items:</strong></p><p>{{requestItems}}</p>{{/if}}{{#if hasCustomerNote}}<p>They said: {{customerNote}}</p>{{/if}}',
    mergeTags: ['orderNumber', 'customerName', 'customerEmail', 'requestType', 'requestReason', 'requestItems', 'customerNote', 'shopName'],
    transactional: false,
  },
]

/** shp_email_templates.trigger to the key core knows it by. The trigger names
 * stay: they are all over the shop's own call sites and the order email log. */
export const SHOP_TRIGGER_TO_TEMPLATE_KEY: Record<string, string> = {
  CREDIT_NOTE_ISSUED: 'shop.credit-note-issued',
  ORDER_CONFIRMED: 'shop.order-confirmed',
  STATUS_PROCESSING: 'shop.status-processing',
  STATUS_SHIPPED: 'shop.status-shipped',
  STATUS_COMPLETED: 'shop.status-completed',
  STATUS_CANCELLED: 'shop.status-cancelled',
  PARTIAL_SHIPPED: 'shop.partial-shipped',
  ADMIN_NEW_ORDER: 'shop.admin-new-order',
  LOW_STOCK: 'shop.low-stock',
  BACK_IN_STOCK: 'shop.back-in-stock',
  IMPORT_COMPLETE: 'shop.import-complete',
  REQUEST_RECEIVED: 'shop.request-received',
  REQUEST_APPROVED: 'shop.request-approved',
  REQUEST_DECLINED: 'shop.request-declined',
  ADMIN_NEW_REQUEST: 'shop.admin-new-request',
}
