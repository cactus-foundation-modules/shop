import { z } from 'zod'
import { prisma } from '@/lib/db/prisma'
import { isPayPalConfigured, isStripeConfigured } from '@/modules/shop/lib/env'
import { resolvePaymentMethodOrder, sortPaymentMethods } from '@/modules/shop/lib/payments/admin-methods'
import {
  filterMethodsByOrderValue, isWithinOrderValueLimit, orderValueLimitFor, orderValueLimitSentence,
} from '@/modules/shop/lib/payments/order-value-limits'
import { formatMoney } from '@/modules/shop/lib/money'

// Shop config, stored as a single JSON column on the shp_settings singleton
// row (Q2 - no shopConfig column on core SiteConfig). Same "corrupted/partial
// column always falls back to defaults" approach as MembersConfig.

const CheckoutStepSchema = z.object({
  id: z.string(), // "contact" | "shipping" | "payment" | "review"
  label: z.string(),
  enabled: z.boolean(),
  required: z.boolean(),
})

const DEFAULT_CHECKOUT_STEPS = [
  { id: 'contact', label: 'Contact details', enabled: true, required: true },
  { id: 'shipping', label: 'Shipping', enabled: true, required: true },
  { id: 'payment', label: 'Payment', enabled: true, required: true },
  { id: 'review', label: 'Review', enabled: true, required: true },
]

// One tickbox the shopper has to deal with before the order can be placed.
// The terms-and-conditions box is stored separately (its own trio of settings,
// because it can fall back to the site's own terms page); everything else the
// owner invents lives in `checkoutAgreements` as one of these.
//
// `statement` may carry one bracketed run - "I agree to the [terms]" - which
// becomes the link when `linkUrl` is set. No brackets and a link still set puts
// the link after the sentence, so a statement written before anyone thought
// about links never loses its link.
const CheckoutAgreementSchema = z.object({
  id: z.string(),
  statement: z.string(),
  linkUrl: z.string().default(''),
  required: z.boolean().default(true),
  enabled: z.boolean().default(true),
})

export type ShpCheckoutAgreementConfig = z.infer<typeof CheckoutAgreementSchema>

export const ShpConfigSchema = z.object({
  // Store identity
  currency: z.string().default('GBP'),
  currencySymbol: z.string().default('£'),
  storeEmail: z.string().default(''),
  orderNumberPrefix: z.string().default('ORD-'),
  weightUnit: z.enum(['kg', 'lb']).default('kg'),
  dimensionUnit: z.enum(['cm', 'in']).default('cm'),

  // Pricing. `price` is always there and always mandatory; this is the set of
  // extra price types the owner has switched on, which decides both what the
  // product editor offers and (for `sale`) what the checkout charges. Defaults
  // to sale + cost, which is exactly what the shop could already do before the
  // other types existed, so switching versions changes nothing on its own.
  enabledPriceTypes: z.array(z.enum(['sale', 'retail', 'trade', 'cost'])).default(['sale', 'cost']),
  // Show the RRP alongside the price on the storefront. Off by default - an RRP
  // is often kept purely as a buying reference and putting it in front of
  // shoppers is a separate decision from recording it.
  showRetailPrice: z.boolean().default(false),

  // Tax
  taxMode: z.enum(['INCLUSIVE', 'EXCLUSIVE']).default('INCLUSIVE'),

  // What the STOREFRONT prints, which is a separate decision from what the
  // figures above mean. A shop keeping its prices net (taxMode EXCLUSIVE) still
  // has to quote consumers gross, and one keeping them gross may want a trade
  // catalogue read net. 'AS_ENTERED' prints them exactly as typed, which is what
  // the shop did before this setting existed - so an upgrade moves no price.
  // The arithmetic and the reasoning live in lib/tax-display-shared.ts.
  priceDisplayTax: z.enum(['AS_ENTERED', 'INCLUSIVE', 'EXCLUSIVE']).default('AS_ENTERED'),
  // Printed after every storefront price ("inc. VAT"). Blank shows nothing.
  // Switching a whole catalogue to gross prices with no word of explanation
  // reads to a returning shopper as a price rise, hence the label.
  priceDisplayTaxSuffix: z.string().default(''),

  // Shipping. Plenty of shops post everything for the same money and never want
  // to see a weight box again. Switching this off drops the weight-based option
  // when adding a shipping rate and hides the weight field on products and
  // variations; rates already saved as weight-based are left alone, so turning
  // it back on gets them back exactly as they were. Defaults on, which is what
  // the shop already did before the switch existed.
  weightBasedShippingEnabled: z.boolean().default(true),

  // Checkout configuration
  guestCheckoutEnabled: z.boolean().default(true),
  postPurchaseAccountPrompt: z.boolean().default(true),
  minimumOrderValue: z.number().nullable().default(null),
  maximumOrderValue: z.number().nullable().default(null),
  requirePhone: z.boolean().default(false),
  checkoutSteps: z.array(CheckoutStepSchema).default(DEFAULT_CHECKOUT_STEPS),

  // Organisation name at checkout. Off by default: a shop selling to the public
  // has no use for it, and an empty box is one more thing to skip. Enabling it
  // shows the box directly under the shopper's name on the contact step, because
  // it says who they are rather than where the parcel goes; requiring it refuses
  // the order without one, both in the browser and at the route that creates the
  // order.
  //
  // It used to live in the delivery address, above line 1. That put it in the
  // wrong place twice over: repeated on every saved address, and describing the
  // buyer rather than the door. Anyone who wants the company on the delivery
  // label puts it in address line 1, where a courier reads it.
  organisationFieldEnabled: z.boolean().default(false),
  organisationRequired: z.boolean().default(false),
  organisationLabel: z.string().default('Organisation name'),

  // The customer's own reference for the order - their purchase order number,
  // their job number, whatever their finance team has to see before they will
  // pay. Off by default, for the same reason as the box above: a shop selling to
  // the public has no use for it.
  //
  // Worth having as its own field rather than a line in the order notes, because
  // it is the number the customer's accounts department matches our invoice
  // against. It is searchable on the orders list, it is snapshotted onto the
  // invoice when the invoice is issued, and it prints on the invoice and the
  // proforma. The label is the owner's: "Purchase order number" on a trade shop,
  // "Job reference" on a builder's merchant, and whatever it says at checkout is
  // what it says on the paperwork.
  customerReferenceFieldEnabled: z.boolean().default(false),
  customerReferenceRequired: z.boolean().default(false),
  customerReferenceLabel: z.string().default('Purchase order number'),
  // Whether the customer may add or correct it themselves after the order has
  // been placed, from their own order page.
  //
  // Worth its own switch rather than following the checkout box: a great many
  // business buyers do not have the number on the day. They buy, their finance
  // team raises the purchase order the week after, and the invoice sits unpaid
  // in a tray until that number is on it. Off by default all the same, because
  // a shop that would rather hear about it on the telephone should not have a
  // box quietly changing its paperwork.
  customerReferenceAfterOrder: z.boolean().default(false),

  // A billing address that is not the delivery address. Off by default: most
  // shops post the goods to whoever paid for them, and an address nobody needs
  // is one more thing between a shopper and the button.
  //
  // Switched on, the delivery step grows a tickbox and a second address form
  // under it, and whatever is filled in there rides on the order as its billing
  // address - which is what the invoice, the proforma and the receipt already
  // print when an order carries one. Nothing is stored when the box is left
  // unticked: an order with no billing address of its own bills to the delivery
  // address exactly as it always did, so switching this on changes nothing for
  // the shoppers who do not need it.
  billingAddressEnabled: z.boolean().default(false),

  // Whether the customer may correct who their invoice is made out to - the
  // company name and the address it goes to - from their own order page, after
  // the order has been placed.
  //
  // Off by default. It is a genuinely useful thing for a trade shop (a buyer
  // orders on the company card, their accounts department then wants the
  // invoice in the holding company's name at the head office) and it is exactly
  // the sort of thing a shop selling to the public should never be asked
  // about.
  customerBillingEditEnabled: z.boolean().default(false),

  // And whether they may still change the COMPANY once the invoice has gone
  // out.
  //
  // Its own switch because it is a different act. Correcting an address on an
  // invoice already sent is an edit; changing the company is a change of the
  // party billed, which means crediting the invoice in full and raising a
  // replacement - two documents, two numbers, and a set of books that has to be
  // told about both. Plenty of owners will want that conversation to happen on
  // the telephone rather than through a text box, so off by default: with it
  // off the customer is told to get in touch, and the address half of the panel
  // carries on working.
  customerBillingReissueEnabled: z.boolean().default(false),

  // Terms and conditions tickbox at checkout. Kept apart from the owner's own
  // tickboxes below because it is the one nearly every shop wants and it can
  // point at the site's own terms page without anyone typing a URL - leave
  // `termsAgreementUrl` blank and the checkout links to whatever page is set as
  // the site's terms, so moving that page never leaves a dead link behind.
  termsAgreementEnabled: z.boolean().default(false),
  termsAgreementRequired: z.boolean().default(true),
  termsAgreementStatement: z.string().default('I have read and agree to the [terms and conditions]'),
  termsAgreementUrl: z.string().default(''),

  // The owner's own tickboxes, in the order they appear beneath the terms one.
  checkoutAgreements: z.array(CheckoutAgreementSchema).default([]),

  // Payment methods. Free-form strings rather than a closed enum so module-
  // contributed methods (via the shop.payment-providers extension point) can be
  // enabled here too; availability is still gated in getAvailablePaymentMethods.
  enabledPaymentMethods: z.array(z.string()).default(['STRIPE']),
  // The shop-wide off switch, and the only one a module-contributed method has.
  // A built-in method is on by being listed in enabledPaymentMethods; a module
  // method decides for itself whether it is ready (its own settings tab), which
  // left the owner no way to park one without pulling its credentials out. Being
  // named here overrules both, for every method - see getAvailablePaymentMethods.
  disabledPaymentMethods: z.array(z.string()).default([]),
  // The order the methods are offered in at checkout, as the owner arranged them
  // on the Payments tab. Holds every method it was told about, switched on or
  // not, so switching one back on returns it to where it was. Anything missing
  // (a method added by a module installed since) sorts to the end. Empty until
  // the owner first arranges them, and until then the old order stands: whatever
  // sequence enabledPaymentMethods happens to be in, then the rest.
  paymentMethodOrder: z.array(z.string()).default([]),
  // The line printed under each method's name at checkout, keyed by method id.
  // Only the owner's own wording lives here: a method left out of this map falls
  // back to whatever line its provider ships with, so a shop that has never
  // opened the box still says something sensible. Free-form keys for the same
  // reason as the arrays above - a method from a module installed later must be
  // nameable here without shop knowing about it.
  paymentMethodDescriptions: z.record(z.string(), z.string()).default({}),
  // Method ids whose brand mark is kept off the checkout. Held the way round
  // that leaves an empty list meaning "show them all", so no shop loses the
  // marks it already has, and a method whose provider ships no mark at all is
  // simply unaffected by being named here.
  hiddenPaymentMethodLogos: z.array(z.string()).default([]),
  // How big an order has to be - and how big it may be - for each method to be
  // offered at all, keyed by method id. Measured against the total the customer
  // pays, VAT and delivery included. Both ends optional, and a method left out
  // of this map has no limits at all, which is every method until somebody sets
  // one. Free-form keys for the same reason as the maps above.
  //
  // The rule this exists for: a card fee is a percentage and an open-banking fee
  // is often flat, so above some figure the shop would rather be paid one way
  // and below it the other. See lib/payments/order-value-limits.ts.
  paymentMethodOrderValueLimits: z
    .record(
      z.string(),
      z.object({
        min: z.number().min(0).nullable().default(null),
        max: z.number().min(0).nullable().default(null),
      }),
    )
    .default({}),
  bankTransferInstructions: z.string().default(''),
  cashInstructions: z.string().default(''),
  // Whether those same words also appear on the checkout page the moment the
  // method is picked, as well as on the thank-you page afterwards. On by
  // default, which is what the shop has always done. An owner who would rather
  // their bank details only went to someone who has actually placed an order
  // can switch this off without emptying the box - the thank-you page and the
  // shopper's order page still print them, so nothing is lost.
  bankTransferInstructionsOnCheckout: z.boolean().default(true),
  cashInstructionsOnCheckout: z.boolean().default(true),
  // Whether an unpaid order settled by hand - a bank transfer, cash on
  // collection - offers the customer the automated methods on their own order
  // page, so they can pay it there and then instead of going and finding their
  // banking app. On by default: the methods offered are the ones this shop
  // already takes at checkout, so nothing new is being asked of the owner, and
  // an order that gets paid sooner is the point of the exercise. An owner who
  // offers bank transfer precisely to keep the card fees off has one switch to
  // say so. See lib/order-pay-online.ts.
  payOnlineOnOrderPage: z.boolean().default(true),

  // Notifications
  adminOrderAlertEmail: z.string().default(''),
  lowStockAlertEnabled: z.boolean().default(true),
  lowStockAlertEmail: z.string().default(''),

  // Shop status
  shopStatus: z.enum(['OPEN', 'BROWSE_ONLY', 'CLOSED']).default('OPEN'),
  shopClosedMessage: z.string().default('Our shop is temporarily unavailable.'),

  // SEO (shopBasePath dropped - Q3, fixed to "shop" via manifest publicBasePath)
  shopTitle: z.string().default(''),
  shopMetaDescription: z.string().default(''),

  // Where a product page lives. 'SHOP' is /shop/products/<slug>, which is what
  // every shop has always had. 'ROOT' puts the product at /<slug> - claimed
  // through core's publicRootSlug mechanism, so an info page or a module index
  // with the same slug still wins. Only the product page itself moves: category,
  // collection and tag pages stay under /shop regardless, and the old
  // /shop/products/<slug> address keeps rendering with a canonical that points
  // at the root form, so nothing already indexed or bookmarked breaks.
  productUrlStyle: z.enum(['SHOP', 'ROOT']).default('SHOP'),

  // Category browsing - shop-wide default for how a category page lists
  // products. 'rollup' also shows products filed in any descendant category;
  // 'exact' shows only products filed directly on the category. Each category
  // can override this via its own product_display_mode.
  categoryProductDisplayMode: z.enum(['rollup', 'exact']).default('rollup'),

  // What the storefront does with a product that has sold out. One decision at
  // three depths, and 'SHOW' is what the shop has always done: the product stays
  // in the grid wearing its "Out of stock" badge, which suits a shop whose stock
  // comes back next week.
  //
  // 'HIDE_FROM_LISTS' drops it from category pages, collections, product grids,
  // search results and the sitemap while its own page stays up. A link somebody
  // has already shared, an ad still running, or a search engine's memory of the
  // page all land somewhere honest instead of on a not-found page, and the
  // notify-me form on it keeps collecting addresses for when it returns.
  //
  // 'HIDE_EVERYWHERE' takes the page as well, so shoppers get the not-found
  // page. For a shop whose sold out means gone for good.
  //
  // Neither level changes what can be bought: an out-of-stock product could not
  // be bought before this setting existed either. And neither touches the admin
  // Products screen, which always lists everything - hiding the sold-out stock
  // from the person whose job is to reorder it would be a strange way to help.
  //
  // What counts as out of stock is the same rule the "Out of stock" badge has
  // always used: the product tracks stock, has none left, is not on backorder
  // and is not a pre-order. A product not tracking stock at all is never hidden.
  // See lib/stock-visibility.ts.
  outOfStockVisibility: z.enum(['SHOW', 'HIDE_FROM_LISTS', 'HIDE_EVERYWHERE']).default('SHOW'),
  // Whether the hiding applies to signed-in staff too. Off by default: staff
  // keep seeing what shoppers cannot, badged "Out of stock" as ever, because a
  // shop that hides sold-out stock from its own staff is a shop where products
  // quietly vanish and nobody notices for a month. Switch it on to walk the
  // storefront exactly as a shopper sees it.
  outOfStockHiddenFromStaff: z.boolean().default(false),

  // Supplier. Off by default, because plenty of shops never care who they
  // bought the thing from. The label is what the field gets called everywhere
  // it appears - the four presets cover nearly everyone, and 'custom' hands the
  // wording over to supplierLabelCustom.
  supplierFieldEnabled: z.boolean().default(false),
  supplierLabelPreset: z.enum(['Supplier', 'Manufacturer', 'Retailer', 'Importer', 'custom']).default('Supplier'),
  supplierLabelCustom: z.string().default(''),
  // Recording who supplied something and telling shoppers about it are two
  // different decisions, so the storefront gets its own switch.
  supplierShowOnFrontend: z.boolean().default(false),
  supplierFieldScope: z.enum(['PRODUCTS', 'PRODUCTS_AND_VARIATIONS']).default('PRODUCTS'),
  // Whether suppliers get a page of their own on the site (/shop/suppliers/...).
  // A third decision again: a shop can record who supplied something, print the
  // name on the product, and still not want a page per supplier. Off by default
  // so switching supplier support on never publishes pages nobody has written.
  //
  // Per-supplier publishing is a tick on the supplier itself
  // (shp_suppliers.storefront_visible); this is the shop-wide master switch that
  // decides whether that tick is offered at all.
  supplierPagesEnabled: z.boolean().default(false),

  // Back-in-stock (addendum A)
  backInStockAccountPrompt: z.boolean().default(true),

  // Pre-orders (addendum B)
  preOrderMixedCartBehaviour: z.enum(['HOLD_ALL', 'PROMPT_SPLIT']).default('HOLD_ALL'),

  // Customer cancel and return requests.
  //
  // Both default ON: a shopper who cannot ask has to email instead, and that
  // email lands in an inbox with no record against the order. A shop that wants
  // the conversation elsewhere can still turn them off.
  //
  // Neither switch ever decides anything by itself - a request is a request,
  // and an owner approves or declines it. Auto-approval was deliberately left
  // out: money leaving on a timer is not a default anyone should inherit.
  cancelRequestsEnabled: z.boolean().default(true),
  returnRequestsEnabled: z.boolean().default(true),
  // Days after the last parcel goes out that a return can still be asked for.
  // 0 means no window at all rather than "always", so the off switch stays the
  // off switch and this stays a length of time.
  returnWindowDays: z.number().int().min(0).max(3650).default(30),

  // "Buy again" on a past order line. Defaults ON,
  // because re-ordering the thing you already liked is the cheapest sale a shop
  // gets. Off suits a shop whose catalogue moves faster than its order history
  // - made-to-order, one-offs, or anything where sending someone back to a
  // product page a year later is more likely to disappoint than to sell.
  //
  // One switch, one label, two behaviours behind it: a plain line re-adds
  // straight to the basket, a personalised one opens the product page on the
  // variation that was bought so the choices are already made.
  buyAgainEnabled: z.boolean().default(true),

  // -------------------------------------------------------------------------
  // Invoices
  // -------------------------------------------------------------------------
  //
  // Off by default, and deliberately so: the shop has always printed a receipt
  // (see the account order receipt page), and a receipt is not an invoice. An
  // invoice carries the seller's registered details and a number that has to
  // stay unique and sequential for as long as the business exists. Switching
  // this on is a decision about paperwork, not a display preference, so nobody
  // inherits it by updating.
  invoicesEnabled: z.boolean().default(false),
  // When one is raised automatically. COMPLETED is the default because that is
  // the moment the shop has finished its side of the bargain. PAID suits a shop
  // that invoices on payment; DISPATCHED suits one that invoices on despatch;
  // MANUAL leaves every invoice to the button on the order screen.
  invoiceIssueOn: z.enum(['MANUAL', 'PAID', 'DISPATCHED', 'COMPLETED']).default('COMPLETED'),
  // Numbering, as shop does for orders. The running number itself comes from a
  // database sequence and cannot be edited - that is rather the point of it.
  invoiceNumberPrefix: z.string().default('INV-'),
  // Days from the tax point that payment is due, printed as a "due by" date.
  // 0 prints no due date at all, which is right for a shop paid at checkout.
  invoicePaymentTermsDays: z.number().int().min(0).max(365).default(0),

  // Who is issuing it. Blank falls back to the shop title and store email, but
  // an invoice with no trading address and no VAT number is not much of an
  // invoice, which is what the settings screen says in as many words.
  invoiceBusinessName: z.string().default(''),
  invoiceAddress: z.string().default(''),
  invoiceVatNumber: z.string().default(''),
  invoiceCompanyNumber: z.string().default(''),
  invoiceContactEmail: z.string().default(''),
  invoiceContactPhone: z.string().default(''),

  // Wording, snapshotted onto each invoice as it is issued so later edits never
  // rewrite paperwork already sent out.
  invoiceHeading: z.string().default('Invoice'),
  invoiceIntro: z.string().default(''),
  // What the tax row is called. "VAT" here, "Sales tax" elsewhere.
  invoiceTaxLabel: z.string().default('VAT'),
  invoicePaymentDetails: z.string().default(''),
  invoiceTerms: z.string().default(''),
  invoiceFooter: z.string().default(''),

  // Whether the customer gets a link to it from their own order page. On by
  // default: an invoice the buyer cannot reach is filing, not invoicing.
  invoiceShowToCustomer: z.boolean().default(true),

  // PDF download. On by default; an owner whose host cannot run the renderer
  // can switch it off and keep the on-screen invoice.
  invoicePdfEnabled: z.boolean().default(true),
  invoicePdfFilenamePrefix: z.string().default('invoice'),

  // Whether the invoice rides along on the email that tells a customer their
  // order is complete. On by default, and for the same reason the proforma is
  // attached to the "how to pay" email: the document is the thing. A buyer's
  // accounts department files what arrives in the inbox, and a link they have
  // to click, on a page they have to be shown, is a step too many.
  //
  // Nothing is attached where there is no live invoice to attach - a shop that
  // raises them by hand and has not, or one whose only invoice has been voided.
  invoiceAttachToEmail: z.boolean().default(true),

  // Credit notes: the document that undoes an invoice when money goes back.
  //
  // On by default wherever invoicing is on, because the alternative is the
  // shop's books carrying VAT on a sale it has refunded - which is money the
  // owner hands HMRC and never took. Switchable all the same: a shop that
  // credits by hand in its own accounts should not be issued documents it did
  // not ask for.
  creditNotesEnabled: z.boolean().default(true),
  // Its own sequence and its own prefix. A credit note must never be handed an
  // invoice number: the two are separate runs of documents and an accountant
  // reading a gap in the invoice numbering wants an answer better than "that
  // one was a refund".
  creditNoteNumberPrefix: z.string().default('CN-'),
  // The heading printed on the document. The rest of the wording - who is
  // issuing it, the footer line - is the invoice's, because they are the same
  // business on the same paper.
  creditNoteHeading: z.string().default('Credit note'),
  // What stands where "Paid in full" stands on an invoice.
  creditNoteWording: z.string().default('This amount has been refunded to your original payment method.'),
  // Whether the customer is emailed a copy when one is raised. On by default: a
  // refund the buyer has no paperwork for is the next support ticket.
  creditNoteEmailCustomer: z.boolean().default(true),
  // Whether that email carries the document itself. On by default, and for the
  // reason the invoice's does: a refund on a card statement with nothing on
  // paper against it is the next support ticket, and whoever files it wants a
  // file rather than a page to go and save from.
  creditNoteAttachToEmail: z.boolean().default(true),
  creditNotePdfFilenamePrefix: z.string().default('credit-note'),

  // -------------------------------------------------------------------------
  // Proforma invoices
  // -------------------------------------------------------------------------
  //
  // The document a shop hands over when the goods are ordered but nobody has
  // been paid yet - a bank transfer, cash on collection, or any method a module
  // contributes with no automated confirmation. A buyer's accounts department
  // will very often not release a payment without one, which is why an order
  // placed by transfer and answered with nothing but a thank-you page tends to
  // sit unpaid.
  //
  // It is emphatically NOT a VAT invoice, and it says so on its face. Nothing
  // is numbered from the invoice sequence, nothing reaches the bookkeeping
  // sinks and no tax point is claimed: the proforma carries the ORDER's own
  // number, and the VAT invoice - with its own number and its own date - is
  // still raised when the shop's invoicing settings say so.
  //
  // Nothing is snapshotted either, and that is the point of difference from an
  // invoice. An invoice is frozen because it is a statutory record of what was
  // charged on a day. A proforma is a live request for payment against an order
  // that can still change, so it is rendered from the order every time it is
  // opened and always shows what is actually owed today.
  proformaEnabled: z.boolean().default(false),
  proformaHeading: z.string().default('Proforma invoice'),
  // The line that keeps this from being mistaken for the real thing. Printed by
  // the notice panel on the proforma layout, and available to any written block
  // on it as {{PROFORMA_NOTICE}}.
  proformaNotice: z.string()
    .default('This is not a VAT invoice. A VAT invoice will follow once payment has been received.'),
  // The small print under an UNPAID proforma. The default says the thing a
  // shopper most needs to know and most often assumes the opposite of: the
  // clock has not started.
  proformaTerms: z.string()
    .default('Nothing is dispatched and no lead time starts until payment has cleared in full. Please quote the order number with your payment.'),
  // The line under the total, which changes with the money rather than with
  // settings - hence two of them.
  proformaUnpaidWording: z.string().default('Not yet paid. Please pay using the details above.'),
  proformaPaidWording: z.string().default('Payment received - thank you. Your VAT invoice follows separately.'),
  // Whether the customer gets a link from the thank-you page and their own
  // order page. On by default: a proforma nobody can reach is a filing exercise.
  proformaShowToCustomer: z.boolean().default(true),
  // Whether the PDF travels with the "we have your order, here is how to pay"
  // email. On by default - that email is the one the buyer forwards to whoever
  // actually presses the button in their bank.
  proformaAttachToEmail: z.boolean().default(true),
  proformaPdfFilenamePrefix: z.string().default('proforma'),
})

export type ShpConfig = z.infer<typeof ShpConfigSchema>

// What the supplier field is actually called on screen. 'custom' with nothing
// typed falls back to "Supplier" rather than rendering a nameless box.
export function resolveSupplierLabel(
  config: Pick<ShpConfig, 'supplierLabelPreset' | 'supplierLabelCustom'>,
): string {
  if (config.supplierLabelPreset === 'custom') return config.supplierLabelCustom.trim() || 'Supplier'
  return config.supplierLabelPreset
}

// One tickbox as the checkout actually renders it: the terms box (when switched
// on) followed by the owner's own, disabled ones dropped. `linkUrl` is already
// resolved - a blank terms URL has been turned into the site's terms page here,
// or the link dropped entirely if the site has not nominated one, so no surface
// downstream has to know that fallback exists.
export type ShpCheckoutAgreement = {
  id: string
  statement: string
  linkUrl: string
  required: boolean
}

export const TERMS_AGREEMENT_ID = 'terms'

// Resolved server-side, never in the browser: the terms link falls back to the
// site's own terms page, which is a core lookup. Both the public config route
// (so the checkout can draw the boxes) and the order-creating route (so it can
// enforce them) read the same list from here, which is what stops the two
// disagreeing about which boxes were compulsory.
export async function resolveCheckoutAgreements(config: ShpConfig): Promise<ShpCheckoutAgreement[]> {
  const agreements: ShpCheckoutAgreement[] = []

  if (config.termsAgreementEnabled) {
    let linkUrl = config.termsAgreementUrl.trim()
    if (!linkUrl) {
      const site = await prisma.siteConfig.findUnique({ where: { id: 'singleton' }, select: { termsPageId: true } })
      const page = site?.termsPageId
        ? await prisma.infoPage.findUnique({ where: { id: site.termsPageId }, select: { slug: true } })
        : null
      linkUrl = page?.slug ? `/${page.slug}` : ''
    }
    agreements.push({
      id: TERMS_AGREEMENT_ID,
      statement: config.termsAgreementStatement.trim() || 'I have read and agree to the [terms and conditions]',
      linkUrl,
      required: config.termsAgreementRequired,
    })
  }

  for (const agreement of config.checkoutAgreements) {
    if (!agreement.enabled) continue
    const statement = agreement.statement.trim()
    // A tickbox with nothing written beside it is an unanswerable question, so
    // it never reaches the shopper - and never blocks the order either.
    if (!statement) continue
    agreements.push({
      id: agreement.id,
      statement,
      linkUrl: agreement.linkUrl.trim(),
      required: agreement.required,
    })
  }

  return agreements
}

export const SHP_CONFIG_DEFAULTS: ShpConfig = ShpConfigSchema.parse({})

// Rows written while the organisation box was called the business name. The
// three keys were renamed rather than kept, so a stored row has to be read
// through this on its way to the schema or a shop that had the box switched on
// would quietly lose it. Nothing is written back: the derived value feeds the
// parse, and the first save from the settings screen persists the new shape
// (zod drops the old keys).
//
// The old default label is treated as never-customised. It said "Business name",
// which is precisely the wording this change exists to be rid of - carrying it
// across verbatim would rename the field everywhere except the one shop that had
// been using it. A label the owner actually typed is kept exactly as typed.
const LEGACY_ORGANISATION_LABEL = 'business name'

function withLegacyOrganisationKeys(raw: unknown): unknown {
  if (raw === null || typeof raw !== 'object') return raw
  const row = raw as Record<string, unknown>
  if (row.organisationFieldEnabled !== undefined) return row
  if (row.businessNameFieldEnabled === undefined && row.businessNameLabel === undefined) return row

  const legacyLabel = typeof row.businessNameLabel === 'string' ? row.businessNameLabel.trim() : ''
  return {
    ...row,
    organisationFieldEnabled: row.businessNameFieldEnabled,
    organisationRequired: row.businessNameRequired,
    ...(legacyLabel && legacyLabel.toLowerCase() !== LEGACY_ORGANISATION_LABEL
      ? { organisationLabel: legacyLabel }
      : {}),
  }
}

export function parseShpConfig(raw: unknown): ShpConfig {
  const result = ShpConfigSchema.safeParse(withLegacyOrganisationKeys(raw ?? {}))
  return result.success ? result.data : SHP_CONFIG_DEFAULTS
}

export async function getShopConfig(): Promise<ShpConfig> {
  const rows = await prisma.$queryRaw<{ config: unknown }[]>`
    SELECT "config" FROM "shp_settings" WHERE "id" = 'singleton' LIMIT 1
  `
  return parseShpConfig(rows[0]?.config)
}

let cachedConfig: ShpConfig | null = null
let cachedConfigAt = 0
const CACHE_TTL_MS = 5_000

export async function getShopConfigCached(): Promise<ShpConfig> {
  const now = Date.now()
  if (cachedConfig && now - cachedConfigAt < CACHE_TTL_MS) return cachedConfig
  const config = await getShopConfig()
  cachedConfig = config
  cachedConfigAt = now
  return config
}

export function invalidateShopConfigCache(): void {
  cachedConfig = null
  cachedConfigAt = 0
}

// Merge-then-validate partial update (MembersConfig pattern).
export async function updateShopConfig(patch: Partial<ShpConfig>): Promise<ShpConfig> {
  const current = await getShopConfig()
  const next = ShpConfigSchema.parse({ ...current, ...patch })
  // Upsert, not a bare UPDATE. The singleton row is seeded by the init
  // migration, but a plain "UPDATE ... WHERE id = 'singleton'" silently affects
  // zero rows if that row is ever missing - the save returns 200 and looks fine,
  // yet nothing persists and the next read falls back to defaults. INSERT ... ON
  // CONFLICT makes a missing row heal itself on first save instead of quietly
  // dropping the write.
  const serialised = JSON.stringify(next)
  await prisma.$executeRaw`
    INSERT INTO "shp_settings" ("id", "config", "updated_at")
    VALUES ('singleton', ${serialised}::jsonb, CURRENT_TIMESTAMP)
    ON CONFLICT ("id") DO UPDATE
      SET "config" = ${serialised}::jsonb, "updated_at" = CURRENT_TIMESTAMP
  `
  invalidateShopConfigCache()
  return next
}

// The four methods shop ships itself. Everything else on the list arrived
// through the shop.payment-providers extension point and gates itself.
export const BUILT_IN_PAYMENT_METHODS = ['STRIPE', 'PAYPAL', 'BANK_TRANSFER', 'CASH'] as const

// Whether one method should be offered at checkout, before ordering. Split out
// because the settings screen wants the same answer per method, and two copies
// of this rule would drift.
export async function isPaymentMethodAvailable(method: string): Promise<boolean> {
  const config = await getShopConfigCached()
  const { getPaymentProvider } = await import('@/modules/shop/lib/payments/registry')
  const provider = getPaymentProvider(method)
  if (!provider) return false
  return paymentMethodAvailability(config, provider)
}

async function paymentMethodAvailability(
  config: ShpConfig,
  provider: { id: string; isAvailable?: () => boolean | Promise<boolean> },
): Promise<boolean> {
  // Switched off here beats everything, including a module method that reports
  // itself perfectly ready.
  if (config.disabledPaymentMethods.includes(provider.id)) return false

  const builtIn = (BUILT_IN_PAYMENT_METHODS as readonly string[]).includes(provider.id)
  if (builtIn) {
    if (!config.enabledPaymentMethods.includes(provider.id)) return false
    if (provider.id === 'STRIPE') return isStripeConfigured()
    if (provider.id === 'PAYPAL') return isPayPalConfigured()
    return true // bank transfer and cash need no credentials
  }

  // Module-contributed methods self-manage their availability from their own
  // settings tab (isAvailable), so they appear once configured without needing
  // to be ticked in shop's settings too.
  return provider.isAvailable ? await provider.isAvailable() : true
}

// Payment methods that would actually reach checkout right now, in the order the
// owner arranged them on the Payments tab. A method ticked but never configured
// (Stripe/PayPal keys missing, or a module provider reporting itself
// unconfigured) never makes it out of here.
export async function getAvailablePaymentMethods(): Promise<string[]> {
  const config = await getShopConfigCached()
  // Dynamic import keeps this file free of a static registry <-> config cycle
  // (bank-transfer / cash providers import getShopConfigCached from here).
  const { getAllPaymentProviders } = await import('@/modules/shop/lib/payments/registry')

  const available: string[] = []
  for (const provider of getAllPaymentProviders()) {
    if (await paymentMethodAvailability(config, provider)) available.push(provider.id)
  }

  return sortPaymentMethods(available, resolvePaymentMethodOrder(config))
}

// The same list, narrowed to the methods this shop is willing to take an order
// of THIS SIZE with - see lib/payments/order-value-limits.ts. `total` is what
// the customer pays, VAT and delivery included; null where nothing has worked
// one out yet, which allows everything.
//
// Kept apart from getAvailablePaymentMethods deliberately: that answer is
// shop-wide and cacheable (the public config route holds it for seconds at a
// time, for every shopper at once), and this one is about one basket.
export async function getPaymentMethodsForOrderValue(total: number | null): Promise<string[]> {
  const config = await getShopConfigCached()
  const available = await getAvailablePaymentMethods()
  return filterMethodsByOrderValue(available, config.paymentMethodOrderValueLimits, total)
}

/** Why a method was refused for an order of this size, in the shopper's terms.
 *  Null where the method has no limits, or the order is inside them. */
export async function orderValueRefusal(method: string, total: number | null): Promise<string | null> {
  const config = await getShopConfigCached()
  const limit = orderValueLimitFor(config.paymentMethodOrderValueLimits, method)
  if (isWithinOrderValueLimit(limit, total)) return null
  const sentence = orderValueLimitSentence(limit, (amount) => formatMoney(amount, config.currencySymbol))
  return sentence
    ? `That way of paying is only available for ${sentence}.`
    : 'That way of paying is not available for an order of this size.'
}
