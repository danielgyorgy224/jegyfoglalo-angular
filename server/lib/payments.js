'use strict';
/**
 * Fizetési szolgáltató: Stripe Checkout (test mode) vagy – kulcs nélkül – helyi DEMO mód.
 *
 * - STRIPE_SECRET_KEY beállítva  → Stripe Checkout, a kártyaadatot kizárólag a Stripe kezeli.
 * - nincs kulcs                  → "mock" mód: a frontend /payment/mock oldala szimulálja a
 *                                  szolgáltatói oldalt (nincs kártyamező, nincs kártyaadat).
 */
const STRIPE_KEY = process.env.STRIPE_SECRET_KEY || '';
const mode = STRIPE_KEY ? 'stripe' : 'mock';
const CURRENCY = 'huf';

let stripe = null;
function client() {
  if (!stripe) stripe = require('stripe')(STRIPE_KEY);
  return stripe;
}

// A Stripe a HUF-ot kétszámjegyű pénznemként kezeli az API-ban: 2 500 Ft = 250000.
const toMinorUnits = (huf) => huf * 100;

/**
 * @returns {Promise<{ sessionId: string, url: string }>}
 */
async function createSession({ ref, total, description, successUrl, cancelUrl, frontendUrl, expiresAtSec }) {
  if (mode === 'mock') {
    return { sessionId: `mock_${ref}`, url: `${frontendUrl}/payment/mock?ref=${encodeURIComponent(ref)}` };
  }
  const session = await client().checkout.sessions.create({
    mode: 'payment',
    payment_method_types: ['card'],
    client_reference_id: ref,
    line_items: [
      {
        quantity: 1,
        price_data: { currency: CURRENCY, unit_amount: toMinorUnits(total), product_data: { name: description } },
      },
    ],
    success_url: successUrl,
    cancel_url: cancelUrl,
    expires_at: expiresAtSec,
  });
  return { sessionId: session.id, url: session.url };
}

/**
 * Ellenőrzi a fizetést a szolgáltatónál (a kliens állításának nem hiszünk).
 * @returns {Promise<{ paid: boolean, paymentRef: string, amount: number|null }>}
 *   amount: a ténylegesen fizetett összeg forintban
 */
async function verifyPayment({ ref, sessionId, mockResult }) {
  if (mode === 'mock') {
    return { paid: mockResult === 'success', paymentRef: `mock_${ref}`, amount: null };
  }
  if (!sessionId) return { paid: false, paymentRef: '', amount: null };
  const session = await client().checkout.sessions.retrieve(sessionId);
  const ok = session.client_reference_id === ref && session.payment_status === 'paid';
  return {
    paid: ok,
    paymentRef: session.id,
    amount: ok ? Math.round(session.amount_total / 100) : null,
    paymentIntent: session.payment_intent,
  };
}

/** Visszatérítés (ha a fizetés után kiderül, hogy a helyek már nem eladhatók). Best effort. */
async function refund(paymentIntent) {
  if (mode !== 'stripe' || !paymentIntent) return false;
  try {
    await client().refunds.create({ payment_intent: paymentIntent });
    return true;
  } catch (err) {
    console.error('[payments] Visszatérítés sikertelen:', err.message);
    return false;
  }
}

module.exports = { mode, createSession, verifyPayment, refund };
