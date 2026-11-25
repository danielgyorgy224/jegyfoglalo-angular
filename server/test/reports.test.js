'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync, spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const PORT = 3994;
const BASE = `http://localhost:${PORT}`;
let proc, tmp, adminToken, cashierToken, seededDatabase;

const api = async (method, url, token) => {
  const res = await fetch(BASE + url, {
    method,
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* üres válasz */ }
  return { status: res.status, json };
};

before(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vigado-reports-'));
  const dbFile = path.join(tmp, 'db.json');
  execFileSync(process.execPath, [path.join(__dirname, '..', 'seed.js')], {
    env: { ...process.env, DB_FILE: dbFile },
    stdio: 'pipe',
  });
  const database = JSON.parse(fs.readFileSync(dbFile, 'utf8'));
  seededDatabase = database;
  database.sales.push({
    id: Math.max(...database.sales.map((sale) => sale.id)) + 1,
    screeningId: 1,
    channel: 'online',
    paymentMethod: 'card',
    reservationId: null,
    tickets: [{ seatId: 1, price: 5000, ticketCode: 'TK-test-1' }],
    ticketCount: 1,
    total: 5000,
    paymentRef: null,
    status: 'cancelled',
    createdAt: '2026-11-24T12:00:00.000Z',
    createdBy: null,
  });
  fs.writeFileSync(dbFile, JSON.stringify(database, null, 2));
  proc = spawn('node', [path.join(__dirname, '..', 'server.js')], {
    env: { ...process.env, PORT, DB_FILE: dbFile, NODE_ENV: 'test', STRIPE_SECRET_KEY: '' },
    stdio: 'ignore',
  });

  let ready = false;
  for (let i = 0; i < 50; i++) {
    try {
      await fetch(BASE + '/public/config');
      ready = true;
      break;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  assert.equal(ready, true, 'A riport tesztszerver nem indult el.');

  const adminLogin = await fetch(BASE + '/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'admin@vigado.test', password: 'Admin123!' }),
  });
  const cashierLogin = await fetch(BASE + '/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'penztaros@vigado.test', password: 'Penztar123!' }),
  });
  const inactiveLogin = await fetch(BASE + '/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'inaktiv@vigado.test', password: 'Valami123!' }),
  });
  assert.equal(adminLogin.status, 200);
  assert.equal(cashierLogin.status, 200);
  assert.equal(inactiveLogin.status, 403);
  adminToken = (await adminLogin.json()).token;
  cashierToken = (await cashierLogin.json()).token;
});

after(() => {
  proc?.kill();
  if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
});

test('a riportok admin jogosultságúak', async () => {
  assert.equal((await api('GET', '/reservations')).status, 401);
  assert.equal((await api('GET', '/sales', cashierToken)).status, 403);
});

test('a seed minden szükséges mintaadatot és hash-elt tesztfiókokat ad', () => {
  assert.equal(seededDatabase.venues.length, 2);
  assert.equal(seededDatabase.halls.length, 3);
  assert.ok(seededDatabase.movies.length >= 6);
  assert.ok(seededDatabase.seats.some((seat) => seat.disabled));
  assert.deepEqual(new Set(seededDatabase.reservations.map((item) => item.channel)), new Set(['online', 'cashier']));
  assert.deepEqual(new Set(seededDatabase.sales.map((item) => item.channel)), new Set(['online', 'cashier']));
  assert.ok(seededDatabase.users.every((user) => /^scrypt\$/.test(user.passwordHash)));
  assert.equal(seededDatabase.users.find((user) => user.email === 'inaktiv@vigado.test').active, false);
});

test('sales riport szűrés, gazdagítás, fizetett darabszám és bevétel', async () => {
  const response = await api(
    'GET',
    '/sales?from=2026-11-24&to=2026-11-24&venueId=1&screeningId=3&movieId=2&channel=cashier&status=paid',
    adminToken,
  );
  assert.equal(response.status, 200);
  assert.equal(response.json.items.length, 1);
  assert.equal(response.json.count, 2);
  assert.equal(response.json.totalRevenue, 3200);
  const item = response.json.items[0];
  assert.equal(item.movieTitle, 'A kert titka');
  assert.equal(item.venueName, 'Kisújszállási Vigadó');
  assert.equal(item.hallName, 'Kamaraterem');
  assert.equal(item.startsAt, '2026-12-05T16:00:00+01:00');
  assert.equal(item.seatLabels.length, 2);
  assert.equal(item.tickets[0].seatLabel, item.seatLabels[0]);
});

test('reservations riport dátum- és csatornaszűrése', async () => {
  const response = await api(
    'GET',
    '/reservations?from=2026-11-21&to=2026-11-21&venueId=1&movieId=1&channel=cashier&status=active',
    adminToken,
  );
  assert.equal(response.status, 200);
  assert.equal(response.json.items.length, 1);
  assert.equal(response.json.count, 1);
  assert.equal(response.json.totalRevenue, 0);
  assert.equal(response.json.items[0].screeningId, 2);
  assert.equal(response.json.items[0].seatLabels.length, 2);
});

test('sales riport összesítése csak paid sorokat vesz figyelembe, lapozás mellett is', async () => {
  const response = await api('GET', '/sales?page=2&pageSize=1', adminToken);
  assert.equal(response.status, 200);
  assert.equal(response.json.items.length, 1);
  assert.equal(response.json.count, 14);
  assert.equal(response.json.totalRevenue, 28700);

  const cancelled = await api('GET', '/sales?status=cancelled', adminToken);
  assert.equal(cancelled.status, 200);
  assert.equal(cancelled.json.items.length, 1);
  assert.equal(cancelled.json.count, 0);
  assert.equal(cancelled.json.totalRevenue, 0);
});

test('hibás dátum, csatorna és lapozás 400-as hibát ad', async () => {
  assert.equal((await api('GET', '/sales?from=not-a-date', adminToken)).status, 400);
  assert.equal((await api('GET', '/reservations?channel=box-office', adminToken)).status, 400);
  assert.equal((await api('GET', '/sales?page=0', adminToken)).status, 400);
});
