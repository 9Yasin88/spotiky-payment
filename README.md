# SPOTIKY — PayPal 5,00 € Checkout

This package replaces the previous Stripe checkout with a server-side PayPal Checkout flow.

## Flow

1. Visitor clicks **JETZT KAUFEN**.
2. The browser calls `/api/create-paypal-order`.
3. The server creates a PayPal Orders v2 order for exactly **5.00 EUR**.
4. The visitor is redirected to PayPal.
5. PayPal returns the visitor to `/paypal/return`.
6. The server captures the order and verifies:
   - order status is `COMPLETED`
   - exactly one purchase unit exists
   - `custom_id` is `SPOTIKY_PACK_001`
   - captured amount is exactly `5.00 EUR`
7. Only after that verification does the server redirect to Snapchat.

The price is fixed server-side and is not accepted from the browser.

## Render

Use:

- **Name:** `spotiky-payment`
- **Language:** Node
- **Branch:** `main`
- **Root Directory:** leave empty
- **Build Command:** `npm install`
- **Start Command:** `npm start`
- **Plan:** Free

Environment Variables:

```text
PAYPAL_CLIENT_ID=<your PayPal LIVE Client ID>
PAYPAL_CLIENT_SECRET=<your PayPal LIVE Secret>
PAYPAL_ENVIRONMENT=live
BASE_URL=https://<your-render-service>.onrender.com
SNAPCHAT_URL=https://www.snapchat.com/t/XJtZak2u
```

Do not put the real secret in GitHub, `index.html`, `script.js`, or any public file.

## PayPal

The PayPal Developer app must be a **Live** app for real payments. Test with Sandbox first if possible, then switch the environment and credentials to Live.

## Important

A successful return/capture is the fulfillment trigger in this package. For production-grade fulfillment that must also work when a buyer closes the browser immediately after payment, configure and verify PayPal webhooks and make fulfillment idempotent.

## Legal

Before accepting real money, complete the site's legally required provider information, privacy notice, terms/refund information, and any business/tax requirements that apply to you. Spotiky is not affiliated with Spotify.
