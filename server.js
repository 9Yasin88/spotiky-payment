require("dotenv").config();
const path = require("path");
const crypto = require("crypto");
const express = require("express");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");

const app = express();
const PORT = Number(process.env.PORT || 3000);
const BASE_URL = String(process.env.BASE_URL || "").replace(/\/$/, "");
const SNAPCHAT_URL = process.env.SNAPCHAT_URL;
const PAYPAL_CLIENT_ID = process.env.PAYPAL_CLIENT_ID;
const PAYPAL_CLIENT_SECRET = process.env.PAYPAL_CLIENT_SECRET;
const PAYPAL_ENVIRONMENT = (process.env.PAYPAL_ENVIRONMENT || "live").toLowerCase();

if (!PAYPAL_CLIENT_ID || !PAYPAL_CLIENT_SECRET || !BASE_URL || !SNAPCHAT_URL) {
  console.error("Missing PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET, BASE_URL or SNAPCHAT_URL.");
  process.exit(1);
}

if (!/^https:\/\//i.test(BASE_URL)) {
  console.error("BASE_URL must use HTTPS.");
  process.exit(1);
}

if (!/^https:\/\/(www\.)?snapchat\.com\//i.test(SNAPCHAT_URL)) {
  console.error("SNAPCHAT_URL must be a Snapchat URL.");
  process.exit(1);
}

const PAYPAL_API = PAYPAL_ENVIRONMENT === "sandbox"
  ? "https://api-m.sandbox.paypal.com"
  : "https://api-m.paypal.com";

app.disable("x-powered-by");
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      imgSrc: ["'self'", "data:"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      frameAncestors: ["'none'"],
      formAction: ["'self'"],
      upgradeInsecureRequests: []
    }
  },
  referrerPolicy: { policy: "no-referrer" }
}));

app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false
}));

app.use(express.json({ limit: "20kb" }));
app.use(express.static(path.join(__dirname, "public"), { extensions: ["html"] }));

const checkoutLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false
});

async function paypalAccessToken() {
  const auth = Buffer.from(`${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET}`).toString("base64");
  const response = await fetch(`${PAYPAL_API}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      "Authorization": `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "Accept": "application/json"
    },
    body: "grant_type=client_credentials"
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`PayPal OAuth failed (${response.status}): ${body.slice(0, 500)}`);
  }

  const data = await response.json();
  if (!data.access_token) throw new Error("PayPal did not return an access token.");
  return data.access_token;
}

async function paypalRequest(endpoint, options = {}) {
  const token = await paypalAccessToken();
  const response = await fetch(`${PAYPAL_API}${endpoint}`, {
    ...options,
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
      "Accept": "application/json",
      ...(options.headers || {})
    }
  });

  const text = await response.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }

  if (!response.ok) {
    const error = new Error(`PayPal API ${response.status}`);
    error.status = response.status;
    error.data = data;
    throw error;
  }

  return data;
}

function isValidPayPalOrderId(id) {
  return typeof id === "string" && /^[A-Z0-9-]{5,50}$/i.test(id);
}

function isCompletedFiveEuroOrder(order) {
  if (!order || order.status !== "COMPLETED") return false;
  const unit = order.purchase_units?.[0];
  const amount = unit?.payments?.captures?.[0]?.amount;
  return Boolean(
    unit?.custom_id === "SPOTIKY_PACK_001" &&
    amount?.currency_code === "EUR" &&
    amount?.value === "5.00" &&
    order.purchase_units?.length === 1
  );
}

app.post("/api/create-paypal-order", checkoutLimiter, async (req, res) => {
  try {
    // The amount is deliberately fixed on the server. The browser cannot change it.
    const requestId = `spotiky-${crypto.randomUUID()}`;
    const order = await paypalRequest("/v2/checkout/orders", {
      method: "POST",
      headers: {
        "PayPal-Request-Id": requestId
      },
      body: JSON.stringify({
        intent: "CAPTURE",
        purchase_units: [{
          reference_id: "SPOTIKY_PACK_001",
          custom_id: "SPOTIKY_PACK_001",
          description: "Spotiky Pack",
          amount: {
            currency_code: "EUR",
            value: "5.00"
          }
        }],
        application_context: {
          brand_name: "SPOTIKY",
          user_action: "PAY_NOW",
          return_url: `${BASE_URL}/paypal/return`,
          cancel_url: `${BASE_URL}/#pack`
        }
      })
    });

    const approvalLink = order.links?.find((link) => link.rel === "approve")?.href;
    if (!order.id || !approvalLink) {
      throw new Error("PayPal order did not contain an approval link.");
    }

    res.json({ url: approvalLink });
  } catch (error) {
    console.error("PayPal create-order error:", error.message);
    res.status(502).json({ error: "paypal-unavailable" });
  }
});

app.get("/paypal/return", async (req, res) => {
  const orderId = typeof req.query.token === "string" ? req.query.token : "";

  if (!isValidPayPalOrderId(orderId)) {
    return res.status(400).send("Ungültige PayPal-Bestellung.");
  }

  try {
    let order = await paypalRequest(`/v2/checkout/orders/${encodeURIComponent(orderId)}`, { method: "GET" });

    if (order.status !== "COMPLETED") {
      order = await paypalRequest(`/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, {
        method: "POST",
        headers: {
          "PayPal-Request-Id": `spotiky-capture-${orderId}`
        },
        body: JSON.stringify({})
      });
    }

    if (!isCompletedFiveEuroOrder(order)) {
      console.error("Unexpected PayPal order after capture:", JSON.stringify({
        id: order.id,
        status: order.status,
        customId: order.purchase_units?.[0]?.custom_id,
        amount: order.purchase_units?.[0]?.payments?.captures?.[0]?.amount
      }));
      return res.status(403).send("Die Zahlung konnte nicht bestätigt werden.");
    }

    return res.redirect(303, SNAPCHAT_URL);
  } catch (error) {
    // If PayPal reports that the order was already captured, retrieve it once more
    // and accept it only if the completed order matches the fixed 5 EUR product.
    try {
      const order = await paypalRequest(`/v2/checkout/orders/${encodeURIComponent(orderId)}`, { method: "GET" });
      if (isCompletedFiveEuroOrder(order)) return res.redirect(303, SNAPCHAT_URL);
    } catch (_) {}

    console.error("PayPal return/capture error:", error.message);
    return res.status(403).send("Zahlung konnte nicht bestätigt werden.");
  }
});

app.get("/health", (req, res) => {
  res.json({ ok: true, payment: "paypal" });
});

app.listen(PORT, () => {
  console.log(`SPOTIKY PayPal server running on port ${PORT}`);
});
