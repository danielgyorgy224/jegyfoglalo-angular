'use strict';
/**
 * Nyilvános végpontok (A személy):
 *   POST /auth/login
 *   GET  /screenings/:id/seatmap
 *   POST /reservations
 *   POST /checkout
 *   GET  /payments/confirm      (a fizetési szolgáltató / mock ide irányítja vissza a böngészőt)
 *   POST /payments/cancel
 * Kiegészítő, csak olvasó végpontok a visszaigazoló oldalakhoz:
 *   GET  /public/config
 *   GET  /public/reservations/:code
 *   GET  /public/checkouts/:ref
 *   GET  /public/orders/:paymentRef
 */
const crypto = require('crypto');
const { verifyPassword, signToken, publicUser } = require('../middleware/auth');
const { buildPriceMap, calcTotal } = require('../lib/pricing');
const seatsLib = require('../lib/seats');
const payments = require('../lib/payments');

const { withMutex, computeStatuses, checkAvailability, purgeExpiredLocks, LOCK_MINUTES } = seatsLib;

const MAX_SEATS = 10;
const PORT = process.env.PORT || 3000;
const PUBLIC_API_URL = (process.env.PUBLIC_API_URL || `http://localhost:${PORT}`).replace(/\/$/, '');
const FRONTEND_URL = (process.env.FRONTEND_URL || 'http://localhost:4200').replace(/\/$/, '');
const ALLOW_PAST = process.env.ALLOW_PAST_SCREENINGS === '1';

class HttpError extends Error {
  constructor(status, message, code, extra = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

module.exports = function publicRoutes(server, router) {
  const db = router.db;
  const state = () => db.getState();

  // ---- segédfüggvények ----------------------------------------------------------------
  const nextId = (collection) => db.get(collection).value().reduce((m, x) => Math.max(m, x.id), 0) + 1;
  const randomCode = (len, alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789') =>
    Array.from(crypto.randomBytes(len), (b) => alphabet[b % alphabet.length]).join('');

  function screeningContext(screeningId) {
    const s = state();
    const screening = s.screenings.find((x) => x.id === screeningId);
    if (!screening) throw new HttpError(404, 'Az előadás nem található.', 'SCREENING_NOT_FOUND');
    const movie = s.movies.find((m) => m.id === screening.movieId);
    const hall = s.halls.find((h) => h.id === screening.hallId);
    const venue = hall && s.venues.find((v) => v.id === hall.venueId);
    return { screening, movie, hall, venue };
  }

  function bookability(screening) {
    if (screening.status !== 'active') return { bookable: false, reason: 'Az előadásra nem lehet jegyet váltani.' };
    if (!ALLOW_PAST && new Date(screening.startsAt) <= new Date()) {
      return { bookable: false, reason: 'Az előadás már elkezdődött.' };
    }
    return { bookable: true, reason: null };
  }

  const summary = ({ screening, movie, hall, venue }) => ({
    screeningId: screening.id,
    startsAt: screening.startsAt,
    movieTitle: movie?.title ?? '',
    movieType: movie?.type ?? 'film',
    venueName: venue?.name ?? '',
    venueAddress: venue ? `${venue.city}, ${venue.address}` : '',
    hallName: hall?.name ?? '',
  });

  /** A kérés törzsének ellenőrzése (foglalás és checkout közös). */
  function parseSeatRequest(body) {
    const b = body || {};
    const screeningId = Number(b.screeningId);
    if (!Number.isInteger(screeningId)) throw new HttpError(400, 'Hiányzik az előadás azonosítója.', 'BAD_REQUEST');
    if (!Array.isArray(b.seatIds) || !b.seatIds.length) {
      throw new HttpError(400, 'Válassz legalább egy széket.', 'BAD_REQUEST');
    }
    const seatIds = b.seatIds.map(Number);
    if (seatIds.some((id) => !Number.isInteger(id)) || new Set(seatIds).size !== seatIds.length) {
      throw new HttpError(400, 'Érvénytelen székazonosítók.', 'BAD_REQUEST');
    }
    if (seatIds.length > MAX_SEATS) {
      throw new HttpError(400, `Egyszerre legfeljebb ${MAX_SEATS} szék választható.`, 'TOO_MANY_SEATS');
    }
    const customerName = String(b.customerName ?? '').trim();
    const customerContact = String(b.customerContact ?? '').trim();
    if (customerName.length < 2 || customerName.length > 100) {
      throw new HttpError(400, 'Add meg a neved (2–100 karakter).', 'BAD_REQUEST');
    }
    if (customerContact.length < 3 || customerContact.length > 120) {
      throw new HttpError(400, 'Adj meg e-mail-címet vagy telefonszámot.', 'BAD_REQUEST');
    }
    return { screeningId, seatIds, customerName, customerContact };
  }

  /** Ellenőrzi az előadás foglalhatóságát és a székek szabadságát. A mutexen BELÜL hívandó! */
  function assertBookable(screeningId, seatIds) {
    purgeExpiredLocks(db);
    const ctx = screeningContext(screeningId);
    const b = bookability(ctx.screening);
    if (!b.bookable) throw new HttpError(409, b.reason, 'SCREENING_CLOSED');
    const s = state();
    const statuses = computeStatuses(s, ctx.screening);
    const check = checkAvailability(statuses, seatIds);
    if (check.unknown.length) {
      throw new HttpError(400, 'A kiválasztott szék nem ehhez az előadáshoz tartozik.', 'UNKNOWN_SEAT', {
        seatIds: check.unknown,
      });
    }
    if (!check.ok) {
      throw new HttpError(409, 'Néhány kiválasztott hely már nem szabad.', 'SEAT_UNAVAILABLE', {
        seatIds: check.unavailable,
      });
    }
    const priceMap = buildPriceMap(s.seats.filter((x) => x.hallId === ctx.screening.hallId), ctx.screening, s.priceOverrides);
    return { ...ctx, priceMap, total: calcTotal(seatIds, priceMap) };
  }

  function seatLines(seatIds, priceMap) {
    const seats = state().seats;
    return seatIds.map((id) => ({
      id,
      label: seats.find((x) => x.id === id)?.label ?? String(id),
      price: priceMap.get(id)?.price ?? 0,
    }));
  }

  const releaseLocks = (ownerRef) => db.get('seatLocks').remove((l) => l.ownerRef === ownerRef).write();

  // ---- POST /auth/login -------------------------------------------------------------
  server.post('/auth/login', (req, res) => {
    const email = String(req.body?.email ?? '').trim().toLowerCase();
    const password = String(req.body?.password ?? '');
    const user = state().users.find((u) => u.email.toLowerCase() === email);
    // mindig fut a jelszóellenőrzés, hogy az időzítés ne árulja el a fiók létezését
    const okPassword = verifyPassword(password, user?.passwordHash ?? 'scrypt$16384$8$1$00$00');
    if (!user || !okPassword) {
      return res.status(401).json({ error: 'Hibás e-mail-cím vagy jelszó.', code: 'BAD_CREDENTIALS' });
    }
    if (!user.active) return res.status(403).json({ error: 'A fiók inaktív.', code: 'ACCOUNT_INACTIVE' });
    res.json({ token: signToken(user), user: publicUser(user) });
  });

  // ---- GET /screenings/:id/seatmap --------------------------------------------------
  server.get('/screenings/:id/seatmap', wrap((req, res) => {
    const ctx = screeningContext(Number(req.params.id));
    const s = state();
    const hallSeats = s.seats.filter((x) => x.hallId === ctx.screening.hallId);
    const statuses = computeStatuses(s, ctx.screening);
    const priceMap = buildPriceMap(hallSeats, ctx.screening, s.priceOverrides);
    const b = bookability(ctx.screening);

    res.json({
      screening: ctx.screening,
      movie: ctx.movie,
      hall: ctx.hall,
      venue: ctx.venue,
      bookable: b.bookable,
      bookableReason: b.reason,
      maxSeats: MAX_SEATS,
      sectors: s.sectors.filter((x) => x.hallId === ctx.screening.hallId),
      seats: hallSeats.map((x) => ({
        id: x.id,
        sectorId: x.sectorId,
        row: x.row,
        number: x.number,
        label: x.label,
        status: statuses.get(x.id),
      })),
      prices: Object.fromEntries([...priceMap].map(([id, p]) => [id, p.price])),
      generatedAt: new Date().toISOString(),
    });
  }));

  // ---- POST /reservations -----------------------------------------------------------
  server.post('/reservations', wrap(async (req, res) => {
    const input = parseSeatRequest(req.body);
    const reservation = await withMutex(() => {
      const ctx = assertBookable(input.screeningId, input.seatIds);
      let code;
      do code = `FG-${randomCode(6)}`; while (state().reservations.some((r) => r.code === code));
      const doc = {
        id: nextId('reservations'),
        code,
        screeningId: input.screeningId,
        seatIds: input.seatIds,
        status: 'active',
        channel: 'online',
        customerName: input.customerName,
        customerContact: input.customerContact,
        createdAt: new Date().toISOString(),
        createdBy: null,
      };
      db.get('reservations').push(doc).write();
      return { doc, ctx };
    });
    const { doc, ctx } = reservation;
    res.status(201).json({
      id: doc.id,
      code: doc.code,
      status: doc.status,
      channel: doc.channel,
      createdAt: doc.createdAt,
      customerName: doc.customerName,
      seats: seatLines(doc.seatIds, ctx.priceMap),
      total: ctx.total,
      ...summary(ctx),
    });
  }));

  // ---- POST /checkout ---------------------------------------------------------------
  server.post('/checkout', wrap(async (req, res) => {
    const input = parseSeatRequest(req.body);
    const ref = `co_${randomCode(16, 'abcdefghjkmnpqrstuvwxyz23456789')}`;
    const expiresAt = new Date(Date.now() + LOCK_MINUTES * 60_000);

    // 1) a helyek zárolása (a végösszeget a szerver számolja)
    const ctx = await withMutex(() => {
      const c = assertBookable(input.screeningId, input.seatIds);
      let id = nextId('seatLocks');
      const locks = input.seatIds.map((seatId) => ({
        id: id++,
        screeningId: input.screeningId,
        seatId,
        until: expiresAt.toISOString(),
        ownerRef: ref,
        customerName: input.customerName,
        customerContact: input.customerContact,
      }));
      db.get('seatLocks').push(...locks).write();
      return c;
    });

    // 2) fizetési munkamenet (a mutexen kívül: hálózati hívás)
    try {
      const session = await payments.createSession({
        ref,
        total: ctx.total,
        description: `${ctx.movie?.title ?? 'Előadás'} – ${input.seatIds.length} jegy`,
        successUrl: `${PUBLIC_API_URL}/payments/confirm?ref=${ref}&session_id={CHECKOUT_SESSION_ID}`,
        cancelUrl: `${FRONTEND_URL}/payment/result?status=cancelled&ref=${ref}&screening=${input.screeningId}`,
        frontendUrl: FRONTEND_URL,
        expiresAtSec: Math.floor(Date.now() / 1000) + 31 * 60, // a Stripe minimuma 30 perc
      });
      res.status(201).json({
        ref,
        mode: payments.mode,
        checkoutUrl: session.url,
        total: ctx.total,
        expiresAt: expiresAt.toISOString(),
      });
    } catch (err) {
      await withMutex(() => releaseLocks(ref));
      console.error('[checkout] A fizetési munkamenet létrehozása sikertelen:', err.message);
      throw new HttpError(502, 'A fizetési szolgáltatóval nem sikerült kapcsolatot teremteni.', 'PAYMENT_PROVIDER_ERROR');
    }
  }));

  // ---- GET /public/checkouts/:ref ---------------------------------------------------
  server.get('/public/checkouts/:ref', wrap((req, res) => {
    const locks = state().seatLocks.filter((l) => l.ownerRef === req.params.ref && new Date(l.until) > new Date());
    if (!locks.length) {
      throw new HttpError(404, 'A fizetés lejárt vagy már lezárult.', 'CHECKOUT_NOT_FOUND');
    }
    const ctx = screeningContext(locks[0].screeningId);
    const s = state();
    const priceMap = buildPriceMap(s.seats.filter((x) => x.hallId === ctx.screening.hallId), ctx.screening, s.priceOverrides);
    const seatIds = locks.map((l) => l.seatId);
    res.json({
      ref: req.params.ref,
      mode: payments.mode,
      expiresAt: locks[0].until,
      seats: seatLines(seatIds, priceMap),
      total: calcTotal(seatIds, priceMap),
      ...summary(ctx),
    });
  }));

  // ---- GET /payments/confirm --------------------------------------------------------
  server.get('/payments/confirm', wrap(async (req, res) => {
    const ref = String(req.query.ref ?? '');
    const sessionId = String(req.query.session_id ?? '');
    const mockResult = String(req.query.mock ?? '');
    const back = (status, extra = {}) => {
      const qs = new URLSearchParams({ status, ...extra }).toString();
      res.redirect(302, `${FRONTEND_URL}/payment/result?${qs}`);
    };

    if (!ref) return back('failed', { reason: 'bad_request' });
    if (payments.mode === 'mock' && !sessionId && !mockResult) return back('failed', { reason: 'bad_request' });

    const locks = state().seatLocks.filter((l) => l.ownerRef === ref);
    const paymentRef = payments.mode === 'mock' ? `mock_${ref}` : sessionId;

    // Idempotencia: ha az eladás már rögzítve van, csak visszairányítjuk.
    if (state().sales.some((x) => x.paymentRef === paymentRef)) return back('success', { order: paymentRef });
    if (!locks.length) return back('failed', { reason: 'expired' });
    const screeningId = locks[0].screeningId;

    let verdict;
    try {
      verdict = await payments.verifyPayment({ ref, sessionId, mockResult });
    } catch (err) {
      console.error('[payments] Ellenőrzés sikertelen:', err.message);
      await withMutex(() => releaseLocks(ref));
      return back('failed', { reason: 'provider_error', screening: screeningId });
    }

    if (!verdict.paid) {
      await withMutex(() => releaseLocks(ref));
      return back('failed', { reason: 'declined', screening: screeningId });
    }

    // A fizetés megtörtént: az eladás rögzítése a mutexen belül.
    const outcome = await withMutex(() => {
      const seatIds = locks.map((l) => l.seatId);
      purgeExpiredLocks(db); // a saját (lejárt) zárolás ilyenkor is törlődik – lent újra ellenőrizzük a székeket
      const ctx = screeningContext(screeningId);
      const s = state();
      const statuses = computeStatuses(s, ctx.screening); // a saját zárolásunk már nem számít, ha lejárt
      const stillFree = checkAvailability(
        new Map([...statuses].map(([id, st]) => [id, st === 'locked' && locks.some((l) => l.seatId === id) ? 'free' : st])),
        seatIds,
      );
      if (!stillFree.ok) return { ok: false, reason: 'seat_taken' };

      const priceMap = buildPriceMap(s.seats.filter((x) => x.hallId === ctx.screening.hallId), ctx.screening, s.priceOverrides);
      const total = calcTotal(seatIds, priceMap);
      if (verdict.amount !== null && verdict.amount !== total) return { ok: false, reason: 'price_changed' };

      const id = nextId('sales');
      const sale = {
        id,
        screeningId,
        channel: 'online',
        paymentMethod: 'card',
        reservationId: null,
        tickets: seatIds.map((seatId, i) => ({
          seatId,
          price: priceMap.get(seatId).price,
          ticketCode: `TK-${100000 + id}-${i + 1}`,
        })),
        ticketCount: seatIds.length,
        total,
        paymentRef: verdict.paymentRef,
        status: 'paid',
        createdAt: new Date().toISOString(),
        createdBy: null,
        customerName: locks[0].customerName,
        customerContact: locks[0].customerContact,
      };
      db.get('sales').push(sale).write();
      releaseLocks(ref);
      return { ok: true };
    });

    if (!outcome.ok) {
      await withMutex(() => releaseLocks(ref));
      await payments.refund(verdict.paymentIntent); // a pénzt visszautaljuk
      return back('failed', { reason: outcome.reason, screening: screeningId });
    }
    back('success', { order: verdict.paymentRef });
  }));

  // ---- POST /payments/cancel --------------------------------------------------------
  server.post('/payments/cancel', wrap(async (req, res) => {
    const ref = String(req.body?.ref ?? '');
    if (!ref) throw new HttpError(400, 'Hiányzik a fizetés azonosítója.', 'BAD_REQUEST');
    const released = await withMutex(() => {
      const before = state().seatLocks.filter((l) => l.ownerRef === ref).length;
      releaseLocks(ref);
      return before;
    });
    res.json({ released });
  }));

  // ---- Visszaigazoló oldalak adatai -------------------------------------------------
  server.get('/public/config', (_req, res) => {
    res.json({ paymentMode: payments.mode, lockMinutes: LOCK_MINUTES, maxSeats: MAX_SEATS });
  });

  server.get('/public/reservations/:code', wrap((req, res) => {
    const r = state().reservations.find((x) => x.code === req.params.code.toUpperCase() && x.channel === 'online');
    if (!r) throw new HttpError(404, 'A foglalás nem található.', 'RESERVATION_NOT_FOUND');
    const ctx = screeningContext(r.screeningId);
    const s = state();
    const priceMap = buildPriceMap(s.seats.filter((x) => x.hallId === ctx.screening.hallId), ctx.screening, s.priceOverrides);
    res.json({
      code: r.code,
      status: r.status,
      createdAt: r.createdAt,
      seats: seatLines(r.seatIds, priceMap),
      total: calcTotal(r.seatIds, priceMap),
      ...summary(ctx),
    });
  }));

  server.get('/public/orders/:ref', wrap((req, res) => {
    const sale = state().sales.find((x) => x.paymentRef === req.params.ref && x.channel === 'online');
    if (!sale) throw new HttpError(404, 'A rendelés nem található.', 'ORDER_NOT_FOUND');
    const ctx = screeningContext(sale.screeningId);
    const seats = state().seats;
    res.json({
      orderRef: sale.paymentRef,
      status: sale.status,
      createdAt: sale.createdAt,
      total: sale.total,
      tickets: sale.tickets.map((t) => ({
        ticketCode: t.ticketCode,
        seatId: t.seatId,
        seatLabel: seats.find((x) => x.id === t.seatId)?.label ?? String(t.seatId),
        price: t.price,
      })),
      ...summary(ctx),
    });
  }));

  // ---- hibakezelő (a végén) ---------------------------------------------------------
  return function errorHandler(err, _req, res, _next) {
    if (err instanceof HttpError) {
      return res.status(err.status).json({ error: err.message, code: err.code, ...err.extra });
    }
    if (err && err.type === 'entity.parse.failed') {
      return res.status(400).json({ error: 'Hibás JSON a kérésben.', code: 'BAD_JSON' });
    }
    console.error('[server] Váratlan hiba:', err);
    res.status(500).json({ error: 'Szerverhiba.', code: 'INTERNAL' });
  };
};

module.exports.HttpError = HttpError;
