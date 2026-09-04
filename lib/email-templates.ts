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
      "<p>Hi {{customerName}},</p><p>Thanks for your order <strong>{{orderNumber}}</strong> - we're getting it ready.</p>{{orderItems}}<p>Total: {{orderTotal}}</p>{{#if hasPreOrderItems}}<p>Pre-order notice: your order contains a pre-order item ({{preOrderItemName}}), expected to dispatch on or before {{preOrderDispatchDate}}.</p>{{/if}}<p>Shipping to: {{shippingAddress}}</p>{{#if hasCustomerReference}}<p>{{customerReferenceLabel}}: <strong>{{customerReference}}</strong></p>{{/if}}",
    mergeTags: ['customerName', 'orderNumber', 'orderItems', 'orderTotal', 'shippingAddress', 'customerReference', 'customerReferenceLabel', 'preOrderItemName', 'preOrderDispatchDate', 'shopName', 'hasCustomerReference', 'hasPreOrderItems'],
    // The item list is a table this module builds itself, photographs and
    // all, with every value escaped on the way in - see
    // lib/order-items-email.ts. As a plain value its markup would arrive as
    // visible angle brackets.
    rawTags: ['orderItems'],
    transactional: false,
  },
  {
    // The other half of the manual-payment pair below. A shopper who picks bank
    // transfer leaves the checkout owing money, and until this existed the only
    // place the account details appeared was the thank-you page - which nobody
    // is reading carefully, and nobody can find a week later. Transactional: it
    // is a request for payment, not marketing.
    //
    // The lead-time sentence is in the default wording on purpose. It is the
    // single most common misunderstanding on a bank transfer - the shopper
    // counts the days from when they ordered, the shop counts them from when
    // the money arrived - and an owner who does not want it can delete the line.
    key: 'shop.order-placed-unpaid',
    label: 'Order placed (payment still to come)',
    subject: 'Your order {{orderNumber}} - how to pay',
    bodyHtml:
      '<p>Hi {{customerName}},</p><p>Thanks - we have your order <strong>{{orderNumber}}</strong>. It is not on its way yet: we start work on it once your payment reaches us.</p>{{orderItems}}<p>Total to pay: <strong>{{orderTotal}}</strong></p>{{#if hasPaymentInstructions}}<p><strong>How to pay by {{paymentMethod}}</strong></p><p>{{paymentInstructions}}</p><p>Please quote <strong>{{orderNumber}}</strong> as the reference, so we can match your payment to your order.</p>{{/if}}<p><strong>Delivery times start from the day your payment reaches us</strong>, not the day you ordered - so the sooner it lands, the sooner your order goes out.</p>{{#if hasPreOrderItems}}<p>Your order also contains a pre-order item ({{preOrderItemName}}), expected to dispatch on or before {{preOrderDispatchDate}}.</p>{{/if}}<p>Shipping to: {{shippingAddress}}</p><p>We will email you the moment your payment arrives.</p>{{#if hasCustomerReference}}<p>{{customerReferenceLabel}}: <strong>{{customerReference}}</strong></p>{{/if}}',
    mergeTags: ['customerName', 'orderNumber', 'orderItems', 'orderTotal', 'shippingAddress', 'paymentMethod', 'paymentInstructions', 'customerReference', 'customerReferenceLabel', 'preOrderItemName', 'preOrderDispatchDate', 'shopName', 'hasCustomerReference', 'hasPaymentInstructions', 'hasPreOrderItems'],
    // Two lots of markup the sending code assembles itself. Bank details are
    // typed into a settings box over several lines and are useless run
    // together, so the sending code escapes them and puts the line breaks back;
    // the item list is the photographed table from lib/order-items-email.ts.
    // Both escape every value they print - nothing here is passed through from
    // a form untouched.
    rawTags: ['paymentInstructions', 'orderItems'],
    transactional: true,
  },
  {
    // A bank transfer or a cash payment is cleared by hand, sometimes days
    // after the order was placed, and until now the only thing the buyer got
    // at that moment was "your order is confirmed" - which they had already
    // been told at checkout. This one says the thing they are actually waiting
    // to hear. Transactional: it is the receipt for money that has moved.
    key: 'shop.payment-received',
    label: 'Payment received',
    subject: 'We have received your payment for order {{orderNumber}}',
    bodyHtml:
      "<p>Hi {{customerName}},</p><p>Your payment of <strong>{{orderTotal}}</strong> for order <strong>{{orderNumber}}</strong> has landed with us - thank you.</p>{{#if hasPaymentReference}}<p>Payment reference: {{paymentReference}}</p>{{/if}}{{orderItems}}{{#if hasPreOrderItems}}<p>Your order contains a pre-order item ({{preOrderItemName}}), expected to dispatch on or before {{preOrderDispatchDate}}.</p>{{/if}}<p>Shipping to: {{shippingAddress}}</p><p>We are getting it ready now and will be in touch when it is on its way.</p>{{#if hasCustomerReference}}<p>{{customerReferenceLabel}}: <strong>{{customerReference}}</strong></p>{{/if}}",
    mergeTags: ['customerName', 'orderNumber', 'orderItems', 'orderTotal', 'shippingAddress', 'paymentMethod', 'paymentReference', 'customerReference', 'customerReferenceLabel', 'preOrderItemName', 'preOrderDispatchDate', 'shopName', 'hasCustomerReference', 'hasPaymentReference', 'hasPreOrderItems'],
    // The item list is a table this module builds itself, photographs and
    // all, with every value escaped on the way in - see
    // lib/order-items-email.ts. As a plain value its markup would arrive as
    // visible angle brackets.
    rawTags: ['orderItems'],
    transactional: true,
  },
  {
    key: 'shop.status-processing',
    label: 'Order processing',
    subject: 'Your order {{orderNumber}} is being processed',
    bodyHtml: '<p>Hi {{customerName}},</p><p>Your order <strong>{{orderNumber}}</strong> is now being processed.</p>',
    mergeTags: ['customerName', 'orderNumber', 'orderItems', 'orderTotal', 'shippingAddress', 'customerReference', 'customerReferenceLabel', 'shopName'],
    rawTags: ['orderItems'],
    transactional: false,
  },
  {
    // The whole order, out in one go. Carries everything a dispatch notice
    // wants: what is in it, where it is going, and the numbers to follow it
    // with. Those last two were passed to nobody before, so an owner who put
    // {{trackingNumber}} in their own wording got a blank line - a merge tag
    // nothing fills collapses to nothing rather than complaining.
    key: 'shop.status-shipped',
    label: 'Order shipped',
    subject: 'Your order {{orderNumber}} is on its way',
    bodyHtml:
      '<p>Hi {{customerName}},</p><p>Your order <strong>{{orderNumber}}</strong> is on its way.</p>{{orderItems}}{{#if hasCarrier}}<p>Sent with {{carrier}}.</p>{{/if}}{{#if hasTracking}}<p>Tracking number: <strong>{{trackingNumber}}</strong></p>{{/if}}<p>Shipping to: {{shippingAddress}}</p>',
    mergeTags: ['customerName', 'orderNumber', 'orderItems', 'orderTotal', 'shippingAddress', 'carrier', 'trackingNumber', 'hasCarrier', 'hasTracking', 'customerReference', 'customerReferenceLabel', 'shopName'],
    rawTags: ['orderItems'],
    transactional: false,
  },
  {
    key: 'shop.status-completed',
    label: 'Order completed',
    subject: 'Your order {{orderNumber}} is complete',
    bodyHtml: '<p>Hi {{customerName}},</p><p>Your order <strong>{{orderNumber}}</strong> is now complete. Thanks for shopping with us.</p>',
    mergeTags: ['customerName', 'orderNumber', 'orderItems', 'orderTotal', 'shippingAddress', 'customerReference', 'customerReferenceLabel', 'shopName'],
    rawTags: ['orderItems'],
    transactional: false,
  },
  {
    key: 'shop.status-cancelled',
    label: 'Order cancelled',
    subject: 'Your order {{orderNumber}} has been cancelled',
    bodyHtml: '<p>Hi {{customerName}},</p><p>Your order <strong>{{orderNumber}}</strong> has been cancelled.</p>',
    mergeTags: ['customerName', 'orderNumber', 'orderItems', 'orderTotal', 'shippingAddress', 'customerReference', 'customerReferenceLabel', 'shopName'],
    rawTags: ['orderItems'],
    transactional: false,
  },
  {
    key: 'shop.partial-shipped',
    label: 'Part of an order dispatched',
    subject: '{{#if hasOutstanding}}Part of your order {{orderNumber}} is on its way{{/if}}{{#if isFinalPart}}The last part of your order {{orderNumber}} is on its way{{/if}}',
    bodyHtml:
      '<p>Hi {{customerName}},</p>{{#if hasOutstanding}}<p>Good news - part of your order <strong>{{orderNumber}}</strong> is on its way. The rest of it is still with us, and we will email you again as soon as it is dispatched.</p>{{/if}}{{#if isFinalPart}}<p>Good news - the last part of your order <strong>{{orderNumber}}</strong> is on its way. That is everything from this order now dispatched.</p>{{/if}}<p><strong>In this parcel:</strong></p>{{dispatchedItems}}{{#if hasOutstanding}}<p><strong>Still to come:</strong></p>{{outstandingItems}}{{/if}}{{#if hasCarrier}}<p>Sent with {{carrier}}.</p>{{/if}}{{#if hasTracking}}<p>Tracking number: {{trackingNumber}}</p>{{/if}}{{#if hasTrackingUrl}}<p><a href="{{trackingUrl}}">Track your parcel</a></p>{{/if}}<p>Parcels sent separately can arrive a day or two apart, so please do not worry if they turn up at different times.</p><p>Thanks for shopping with {{shopName}}.</p>',
    mergeTags: ['customerName', 'orderNumber', 'dispatchedItems', 'outstandingItems', 'carrier', 'trackingNumber', 'trackingUrl', 'hasCarrier', 'hasTracking', 'hasTrackingUrl', 'hasOutstanding', 'isFinalPart', 'shopName'],
    // The item list is a table this module builds itself, photographs and
    // all, with every value escaped on the way in - see
    // lib/order-items-email.ts. As a plain value its markup would arrive as
    // visible angle brackets.
    rawTags: ['dispatchedItems', 'outstandingItems'],
    transactional: false,
  },
  {
    key: 'shop.admin-new-order',
    label: 'New order (admin alert)',
    subject: 'New order received: {{orderNumber}}',
    bodyHtml: '<p>New order <strong>{{orderNumber}}</strong> from {{customerName}} ({{customerEmail}}).</p><p>Total: {{orderTotal}}</p>{{#if hasCustomerReference}}<p>{{customerReferenceLabel}}: <strong>{{customerReference}}</strong></p>{{/if}}',
    mergeTags: ['orderNumber', 'customerName', 'customerEmail', 'orderTotal', 'customerReference', 'customerReferenceLabel', 'shopName', 'hasCustomerReference'],
    transactional: false,
  },
  {
    // The owner's alert for an order nobody has been paid for. Separate from
    // shop.admin-new-order because that one's job is "money is in, get it out
    // of the door" and this one's is "somebody owes you money" - an owner who
    // packs the first one on sight would be packing this one too early.
    key: 'shop.admin-new-order-unpaid',
    label: 'New order, payment still to come (admin alert)',
    subject: 'New order awaiting payment: {{orderNumber}}',
    bodyHtml:
      '<p>New order <strong>{{orderNumber}}</strong> from {{customerName}} ({{customerEmail}}), placed by {{paymentMethod}}.</p><p>Total: {{orderTotal}} - <strong>not paid yet</strong>. They have been emailed how to pay, and the order sits in Awaiting payment until you mark it received.</p>{{orderItems}}{{#if hasCustomerReference}}<p>{{customerReferenceLabel}}: <strong>{{customerReference}}</strong></p>{{/if}}',
    mergeTags: ['orderNumber', 'customerName', 'customerEmail', 'orderTotal', 'orderItems', 'paymentMethod', 'customerReference', 'customerReferenceLabel', 'shopName', 'hasCustomerReference'],
    // The item list is a table this module builds itself, photographs and
    // all, with every value escaped on the way in - see
    // lib/order-items-email.ts. As a plain value its markup would arrive as
    // visible angle brackets.
    rawTags: ['orderItems'],
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
    mergeTags: ['customerName', 'orderNumber', 'requestType', 'requestReason', 'requestItems', 'shopName', 'hasItems'],
    transactional: false,
  },
  {
    key: 'shop.request-approved',
    label: 'Cancel or return request approved',
    subject: 'Your {{requestType}} request for order {{orderNumber}} is approved',
    bodyHtml:
      '<p>Hi {{customerName}},</p><p>Good news - we have approved your {{requestType}} request for order <strong>{{orderNumber}}</strong>.</p>{{#if hasAdminNote}}<p>{{adminNote}}</p>{{/if}}{{#if hasRefund}}<p>A refund of {{refundAmount}} is on its way back to you. Depending on your bank it can take a few working days to show up.</p>{{/if}}<p>Thanks for your patience.</p>',
    mergeTags: ['customerName', 'orderNumber', 'requestType', 'adminNote', 'refundAmount', 'shopName', 'hasAdminNote', 'hasRefund'],
    transactional: false,
  },
  {
    key: 'shop.request-declined',
    label: 'Cancel or return request declined',
    subject: 'About your {{requestType}} request for order {{orderNumber}}',
    bodyHtml:
      '<p>Hi {{customerName}},</p><p>We have looked at your {{requestType}} request for order <strong>{{orderNumber}}</strong>, and unfortunately we are not able to accept it this time.</p>{{#if hasAdminNote}}<p>{{adminNote}}</p>{{/if}}<p>If you think that is wrong, reply to this email and we will take another look.</p>',
    mergeTags: ['customerName', 'orderNumber', 'requestType', 'adminNote', 'shopName', 'hasAdminNote'],
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
    // The document travels with this one rather than sitting behind a link.
    // Whoever files a refund wants a file, and the link was a step too many -
    // the same lesson the proforma and the invoice both taught. The link block
    // is the fallback for a shop with PDFs switched off, or a printer having a
    // bad day: a customer with neither the file nor the link has nothing.
    bodyHtml:
      '<p>Hi {{customerName}},</p><p>We have refunded {{creditAmount}} against order <strong>{{orderNumber}}</strong>, and here is the credit note for your records.</p>{{#if hasReason}}<p>Reason: {{creditReason}}</p>{{/if}}{{#if hasCreditNotePdf}}<p>Credit note <strong>{{creditNoteNumber}}</strong> is attached to this email as a PDF.</p>{{/if}}{{#if hasCreditNoteLink}}<p><a href="{{creditNoteUrl}}">View credit note {{creditNoteNumber}}</a></p>{{/if}}<p>Depending on your bank the money can take a few working days to show up.</p>',
    mergeTags: ['customerName', 'orderNumber', 'creditNoteNumber', 'creditNoteUrl', 'creditAmount', 'creditReason', 'hasReason', 'hasCreditNotePdf', 'hasCreditNoteLink', 'invoiceNumber', 'shopName'],
    transactional: true,
  },
  // The pair of documents raised when the company on an invoice changes. One
  // email, not two: a bare "credit note issued" reads as money coming back, and
  // nothing is coming back here - the sale is unchanged, only the name on the
  // paperwork. Transactional: it is the record of documents that replace ones
  // the buyer's accounts department has already filed.
  {
    key: 'shop.invoice-reissued',
    label: 'Invoice reissued in a new name',
    subject: 'New invoice {{invoiceNumber}} for order {{orderNumber}}',
    bodyHtml:
      '<p>Hi {{customerName}},</p><p>You asked us to change the company on your paperwork for order <strong>{{orderNumber}}</strong> to <strong>{{companyName}}</strong>.</p><p>We cannot rewrite an invoice that has already gone out, so we have done it the proper way instead: credit note <strong>{{creditNoteNumber}}</strong> cancels invoice {{oldInvoiceNumber}}, and invoice <strong>{{invoiceNumber}}</strong> replaces it in the new name.</p><p>Nothing about what you paid has changed, and there is nothing for you to do. Your accounts department will want both.</p><p><a href="{{invoiceUrl}}">View invoice {{invoiceNumber}}</a><br /><a href="{{creditNoteUrl}}">View credit note {{creditNoteNumber}}</a></p>',
    mergeTags: ['customerName', 'orderNumber', 'companyName', 'oldInvoiceNumber', 'creditNoteNumber', 'invoiceNumber', 'invoiceUrl', 'creditNoteUrl', 'shopName'],
    transactional: true,
  },
  {
    key: 'shop.admin-new-request',
    label: 'New cancel or return request (admin alert)',
    subject: 'New {{requestType}} request: order {{orderNumber}}',
    bodyHtml:
      '<p>{{customerName}} ({{customerEmail}}) has asked for a {{requestType}} on order <strong>{{orderNumber}}</strong>.</p><p>Reason: {{requestReason}}</p>{{#if hasItems}}<p><strong>Items:</strong></p><p>{{requestItems}}</p>{{/if}}{{#if hasCustomerNote}}<p>They said: {{customerNote}}</p>{{/if}}',
    mergeTags: ['orderNumber', 'customerName', 'customerEmail', 'requestType', 'requestReason', 'requestItems', 'customerNote', 'shopName', 'hasCustomerNote', 'hasItems'],
    transactional: false,
  },
]

/** shp_email_templates.trigger to the key core knows it by. The trigger names
 * stay: they are all over the shop's own call sites and the order email log. */
export const SHOP_TRIGGER_TO_TEMPLATE_KEY: Record<string, string> = {
  CREDIT_NOTE_ISSUED: 'shop.credit-note-issued',
  INVOICE_REISSUED: 'shop.invoice-reissued',
  ORDER_CONFIRMED: 'shop.order-confirmed',
  ORDER_PLACED_UNPAID: 'shop.order-placed-unpaid',
  PAYMENT_RECEIVED: 'shop.payment-received',
  STATUS_PROCESSING: 'shop.status-processing',
  STATUS_SHIPPED: 'shop.status-shipped',
  STATUS_COMPLETED: 'shop.status-completed',
  STATUS_CANCELLED: 'shop.status-cancelled',
  PARTIAL_SHIPPED: 'shop.partial-shipped',
  ADMIN_NEW_ORDER: 'shop.admin-new-order',
  ADMIN_NEW_ORDER_UNPAID: 'shop.admin-new-order-unpaid',
  LOW_STOCK: 'shop.low-stock',
  BACK_IN_STOCK: 'shop.back-in-stock',
  IMPORT_COMPLETE: 'shop.import-complete',
  REQUEST_RECEIVED: 'shop.request-received',
  REQUEST_APPROVED: 'shop.request-approved',
  REQUEST_DECLINED: 'shop.request-declined',
  ADMIN_NEW_REQUEST: 'shop.admin-new-request',
}
