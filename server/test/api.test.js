'use strict';
// Futtatás: npm test  (saját, ideiglenes db-másolaton, mock fizetési módban)
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const PORT = 3991;
const BASE = `http://localhost:${PORT}`;
let proc, tmp;

const api = async (method, url, body, token) => {
  const res = await fetch(BASE + url, {
    method,
    redirect: 'manual',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* nem JSON (pl. átirányítás) */ }
  return { status: res.status, json, location: res.headers.get('location') };
};
const person = { customerName: 'Teszt Elek', customerContact: 'teszt@example.test' };
const seatStatus = async (screeningId, seatId) =>
  (await api('GET', `/screenings/${screeningId}/seatmap`)).json.seats.find((s) => s.id === seatId).status;

before(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vigado-'));
  fs.copyFileSync(path.join(__dirname, '..', 'db.json'), path.join(tmp, 'db.json'));
  proc = spawn('node', [path.join(__dirname, '..', 'server.js')], {
    env: { ...process.env, PORT, DB_FILE: path.join(tmp, 'db.json'), NODE_ENV: 'test', STRIPE_SECRET_KEY: '', ALLOW_PAST_SCREENINGS: '1' },
    stdio: 'ignore',
  });
  for (let i = 0; i < 50; i++) {
    try { await fetch(BASE + '/public/config'); return; } catch { await new Promise((r) => setTimeout(r, 100)); }
  }
  throw new Error('A szerver nem indult el');
});
after(() => { proc?.kill(); fs.rmSync(tmp, { recursive: true, force: true }); });

test('login: siker, hibás jelszó, inaktív fiók', async () => {
  const ok = await api('POST', '/auth/login', { email: 'admin@vigado.test', password: 'Admin123!' });
  assert.equal(ok.status, 200);
  assert.equal(ok.json.user.role, 'admin');
  assert.ok(ok.json.token);
  assert.equal(ok.json.user.passwordHash, undefined);
  assert.equal((await api('POST', '/auth/login', { email: 'admin@vigado.test', password: 'rossz' })).status, 401);
  // az inaktív fiók (helyes jelszó híján is) nem léphet be
  const inactive = await api('POST', '/auth/login', { email: 'inaktiv@vigado.test', password: 'Valami123!' });
  assert.ok([401, 403].includes(inactive.status));
});

test('árszabály: székár → szektorár → alapár (1. előadás)', async () => {
  const { json } = await api('GET', '/screenings/1/seatmap');
  const byLabel = (label, sectorId) => json.seats.find((s) => s.label === label && s.sectorId === sectorId);
  assert.equal(json.prices[byLabel('A3', 1).id], 3000); // egyedi székár
  assert.equal(json.prices[byLabel('A1', 1).id], 2500); // szektorár
  assert.equal(json.prices[byLabel('D1', 2).id], 2000); // alapár
});

test('védett gyűjtemények kívülről nem írhatók, a users nem olvasható token nélkül', async () => {
  assert.equal((await api('POST', '/sales', { total: 1 })).status, 403);
  assert.equal((await api('PATCH', '/reservations/1', { status: 'cancelled' })).status, 403);
  assert.equal((await api('POST', '/seatLocks', {})).status, 403);
  assert.equal((await api('GET', '/seatLocks')).status, 403);
  assert.equal((await api('GET', '/users')).status, 401);
  assert.equal((await api('POST', '/movies', { title: 'x' })).status, 401);
  const cashier = (await api('POST', '/auth/login', { email: 'penztaros@vigado.test', password: 'Penztar123!' })).json.token;
  assert.equal((await api('GET', '/users', null, cashier)).status, 403);
  assert.equal((await api('GET', '/sales', null, cashier)).status, 403);
});

test('foglalás: siker, majd ugyanarra a székre ütközés (409)', async () => {
  const seatId = 40;
  const r1 = await api('POST', '/reservations', { screeningId: 1, seatIds: [seatId], ...person });
  assert.equal(r1.status, 201);
  assert.match(r1.json.code, /^FG-[A-Z0-9]{6}$/);
  assert.equal(await seatStatus(1, seatId), 'reserved');
  const r2 = await api('POST', '/reservations', { screeningId: 1, seatIds: [seatId], ...person });
  assert.equal(r2.status, 409);
  assert.deepEqual(r2.json.seatIds, [seatId]);
  const lookup = await api('GET', `/public/reservations/${r1.json.code}`);
  assert.equal(lookup.status, 200);
  assert.equal(lookup.json.customerName, undefined); // személyes adat nem megy ki
});

test('letiltott és eladott szék nem foglalható / nem fizethető', async () => {
  assert.equal((await api('POST', '/reservations', { screeningId: 1, seatIds: [91], ...person })).status, 409); // letiltott
  assert.equal((await api('POST', '/checkout', { screeningId: 1, seatIds: [3], ...person })).status, 409); // eladott
});

test('érvénytelen kérések: hiányzó név, túl sok szék, idegen terem széke', async () => {
  assert.equal((await api('POST', '/reservations', { screeningId: 1, seatIds: [50], customerName: '', customerContact: 'x@y.hu' })).status, 400);
  const many = Array.from({ length: 11 }, (_, i) => 100 + i);
  assert.equal((await api('POST', '/reservations', { screeningId: 1, seatIds: many, ...person })).status, 400);
  assert.equal((await api('POST', '/reservations', { screeningId: 1, seatIds: [150], ...person })).status, 400); // másik terem
});

test('sikeres fizetés: zárolás → eladás → jegyazonosító; a szék eladott lesz', async () => {
  const seatIds = [60, 61];
  const co = await api('POST', '/checkout', { screeningId: 1, seatIds, ...person });
  assert.equal(co.status, 201);
  assert.equal(co.json.mode, 'mock');
  assert.equal(co.json.total, 4000); // a szerver számol, a kliens nem küld összeget
  assert.equal(await seatStatus(1, 60), 'locked');
  // ugyanaz a szék online foglalásra most zárolt
  assert.equal((await api('POST', '/reservations', { screeningId: 1, seatIds: [60], ...person })).status, 409);

  const conf = await api('GET', `/payments/confirm?ref=${co.json.ref}&mock=success`);
  assert.equal(conf.status, 302);
  assert.match(conf.location, /status=success&order=mock_/);
  const order = await api('GET', `/public/orders/mock_${co.json.ref}`);
  assert.equal(order.status, 200);
  assert.equal(order.json.total, 4000);
  assert.match(order.json.tickets[0].ticketCode, /^TK-\d{6}-1$/);
  assert.equal(await seatStatus(1, 60), 'sold');
  // a callback ismétlése nem rögzít második eladást
  await api('GET', `/payments/confirm?ref=${co.json.ref}&mock=success`);
  const again = await api('GET', `/public/orders/mock_${co.json.ref}`);
  assert.equal(again.json.tickets.length, 2);
});

test('sikertelen és megszakított fizetés után a helyek felszabadulnak', async () => {
  const declined = await api('POST', '/checkout', { screeningId: 2, seatIds: [80], ...person });
  const conf = await api('GET', `/payments/confirm?ref=${declined.json.ref}&mock=declined`);
  assert.match(conf.location, /status=failed&reason=declined/);
  assert.equal(await seatStatus(2, 80), 'free');

  const cancelled = await api('POST', '/checkout', { screeningId: 2, seatIds: [81], ...person });
  assert.equal(await seatStatus(2, 81), 'locked');
  const c = await api('POST', '/payments/cancel', { ref: cancelled.json.ref });
  assert.equal(c.json.released, 1);
  assert.equal(await seatStatus(2, 81), 'free');
});

test('versenyhelyzet: két egyidejű foglalás ugyanarra a székre – csak az egyik sikerül', async () => {
  const body = { screeningId: 4, seatIds: [125], ...person };
  const results = await Promise.all([api('POST', '/reservations', body), api('POST', '/checkout', body), api('POST', '/reservations', body)]);
  assert.equal(results.filter((r) => r.status === 201).length, 1);
  assert.equal(results.filter((r) => r.status === 409).length, 2);
});
