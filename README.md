# Shop module

Full ecommerce foundation for Cactus: catalogue, checkout, payments (Stripe,
PayPal, bank transfer, cash), orders, refunds, customers, discounts, tax and
shipping zones, back-in-stock notifications, pre-orders, CSV
import/export, related products/upsells, and optional page-builder-designed
product descriptions.

Table prefix: `shp_`. Public routes mount at `/shop`. See `SHOP_MODULE_SPEC.md`
and `SHOP_MODULE_SPEC_ADDENDUM.md` in the core repo for the full spec.

## Extension points published for companion modules

A companion module claims one of these with an `extensionPoints` entry in its own
manifest. Every one of them is inert on a shop with no add-ons installed.

| Point | What it does |
| --- | --- |
| `shop.commerce-mode` | Decides how the shop is transacted with at all: the buy-button and cart-button wording, where the cart leads, whether prices may be shown, and whether `/shop/checkout` serves. One point rather than four, because a shop half-switched reads as broken. See `lib/commerce-mode.ts`. |
| `shop.cart-header-actions` | Puts a control on the cart page's own heading row, to the right of "Your cart" - for something a shopper has to be able to find without having been told it exists. See `lib/cart-header-actions.ts`. |
| `shop.cart-line-resolver` (+ `-prefetch`) | Prices and validates per-line personalisation, and may offer a per-line picker. See `lib/line-meta.ts`. |
| `shop.cart-summary` | Adds whole-basket notes to the cart and drawer. See `lib/cart-summary.ts`. |
| `shop.product-detail-parts` | Takes over a claimed product's gallery, price and purchase area. See `lib/detail-slot.ts`. |
| `shop.product-detail-tabs` / `-spec` | Adds a product tab, or replaces the Specification body. |
| `shop.card-media` / `shop.product-card-prices` | Adds card images/overlays, or prices a card itself. |
| `shop.payment-providers` | Adds a payment method. |
| `shop.tax-shipping-tabs` | Adds an admin tab under Shop > Tax & shipping. |
| `shop.settings-sub-tabs` / `shop.payments` | Hosts another module's settings panel inside Shop's own settings tab (`host` on its manifest `settingsTabs` entry). |
