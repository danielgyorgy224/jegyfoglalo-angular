'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const PORT = 3992;
const BASE = `http://localhost:${PORT}`;
let proc, tmp, adminToken, cashierToken, lastAdminId;

const api = async (method, url, body, token) => {
  const res = await fetch(BASE + url, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* üres válasz */ }
  return { status: res.status, json };
};

before(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vigado-admin-'));
  const dbFile = path.join(tmp, 'db.json');
  fs.copyFileSync(path.join(__dirname, '..', 'db.json'), dbFile);
  const initialDb = JSON.parse(fs.readFileSync(dbFile, 'utf8'));
  lastAdminId = initialDb.users.find((user) => user.role === 'admin' && user.active).id;
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
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  assert.equal(ready, true, 'Az admin tesztszerver nem indult el.');
  const admin = await api('POST', '/auth/login', { email: 'admin@vigado.test', password: 'Admin123!' });
  const cashier = await api('POST', '/auth/login', { email: 'penztaros@vigado.test', password: 'Penztar123!' });
  assert.equal(admin.status, 200);
  assert.equal(cashier.status, 200);
  adminToken = admin.json.token;
  cashierToken = cashier.json.token;
});

after(() => {
  proc?.kill();
  if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
});

test('admin végpontok: 401 token nélkül, 403 pénztárosnak', async () => {
  const body = { sectors: [{ name: 'Új', rows: ['A'], seatsPerRow: 2 }] };
  assert.equal((await api('POST', '/admin/halls/200/seats/generate', body)).status, 401);
  assert.equal((await api('POST', '/users', {
    name: 'Teszt Admin', email: 'uj-admin@example.test', password: 'Jelszo123!', role: 'admin',
  }, cashierToken)).status, 403);
});

test('felhasználók: jelszó hash-elése, egyedi e-mail, utolsó admin és törlés tiltása', async () => {
  const created = await api('POST', '/users', {
    name: 'Teszt Pénztáros',
    email: 'teszt-penztaros@example.test',
    password: 'Titkos123!',
    role: 'cashier',
  }, adminToken);
  assert.equal(created.status, 201);
  assert.equal(created.json.passwordHash, undefined);
  assert.equal(created.json.password, undefined);

  const storedDb = JSON.parse(fs.readFileSync(path.join(tmp, 'db.json'), 'utf8'));
  const stored = storedDb.users.find((user) => user.email === 'teszt-penztaros@example.test');
  assert.match(stored.passwordHash, /^scrypt\$/);
  assert.equal(stored.password, undefined);

  const patched = await api('PATCH', `/users/${stored.id}`, {
    active: false,
    password: 'MasikJelszo123!',
  }, adminToken);
  assert.equal(patched.status, 200);
  assert.equal(patched.json.passwordHash, undefined);
  assert.equal(patched.json.active, false);
  const replaced = await api('PUT', `/users/${stored.id}`, {
    name: 'Frissített Teszt',
    email: 'teszt-penztaros@example.test',
    role: 'cashier',
    active: true,
  }, adminToken);
  assert.equal(replaced.status, 200);
  assert.equal(replaced.json.name, 'Frissített Teszt');
  assert.equal(replaced.json.passwordHash, undefined);

  assert.equal((await api('POST', '/users', {
    name: 'Másik', email: 'TESZT-PENZTAROS@example.test', password: 'Titkos123!', role: 'cashier',
  }, adminToken)).status, 409);

  const deactivated = await api('PATCH', `/users/${lastAdminId}`, { active: false }, adminToken);
  assert.equal(deactivated.status, 409);
  const deleted = await api('DELETE', `/users/${stored.id}`, undefined, adminToken);
  assert.equal(deleted.status, 405);
});

test('ülésrács-generálás: létrehozás, duplikáció és hibás bemenet', async () => {
  const hall = await api('POST', '/halls', { venueId: 1, name: 'Tesztterem' }, adminToken);
  assert.equal(hall.status, 201);
  const body = { sectors: [{ name: 'Földszint', rows: ['A', 'B'], seatsPerRow: 3 }] };
  const generated = await api('POST', `/admin/halls/${hall.json.id}/seats/generate`, body, adminToken);
  assert.equal(generated.status, 201);
  assert.equal(generated.json.sectors.length, 1);
  assert.equal(generated.json.seats.length, 6);
  assert.equal(generated.json.seats[3].label, 'B1');
  const disabled = await api('PATCH', `/seats/${generated.json.seats[0].id}/disable`, {
    disabledReason: 'Karbantartás',
  }, adminToken);
  assert.equal(disabled.status, 200);
  assert.equal(disabled.json.disabled, true);
  const enabled = await api('PATCH', `/seats/${generated.json.seats[0].id}/enable`, {}, adminToken);
  assert.equal(enabled.status, 200);
  assert.equal(enabled.json.disabled, false);
  assert.equal((await api('POST', `/admin/halls/${hall.json.id}/seats/generate`, body, adminToken)).status, 409);
  assert.equal((await api('POST', '/admin/halls/200/seats/generate', {
    sectors: [{ name: 'Hibás', rows: ['A', 'A'], seatsPerRow: 2 }],
  }, adminToken)).status, 400);
});

test('székletiltás és árak: jövőbeli foglalás védelme, validálás, sikeres módosítás', async () => {
  const blocked = await api('PATCH', '/seats/15/disable', { disabledReason: 'Teszt' }, adminToken);
  assert.equal(blocked.status, 409);
  assert.equal(blocked.json.code, 'SEAT_HAS_FUTURE_BOOKINGS');

  const seatMapBefore = await api('GET', '/screenings/1/seatmap');
  const targetSeat = seatMapBefore.json.seats.find((seat) => seat.sectorId === 1 && seat.label === 'A1');
  const prices = await api('PUT', '/screenings/1/prices', {
    basePrice: 2100,
    sectors: { 1: 2600 },
    seats: { [targetSeat.id]: null },
  }, adminToken);
  assert.equal(prices.status, 200);
  const seatMapAfter = await api('GET', '/screenings/1/seatmap');
  assert.equal(seatMapAfter.json.prices[targetSeat.id], 2600);
  assert.equal((await api('PUT', '/screenings/1/prices', {
    basePrice: 2.5,
  }, adminToken)).status, 400);

  const poster = await api('PUT', '/movies/1/poster', { dataUrl: 'data:image/png;base64,aGVsbG8=' }, adminToken);
  assert.equal(poster.status, 200);
  assert.equal(poster.json.posterUrl, 'data:image/png;base64,aGVsbG8=');
  assert.equal((await api('PUT', '/movies/1/poster', { dataUrl: 'data:image/svg+xml;base64,AAAA' }, adminToken)).status, 400);
  const oversized = Buffer.alloc(1024 * 1024 + 1).toString('base64');
  assert.equal((await api('PUT', '/movies/1/poster', {
    dataUrl: `data:image/webp;base64,${oversized}`,
  }, adminToken)).status, 400);
});

test('foglaláshoz kapcsolt előadás nem törölhető', async () => {
  for (const path of ['/venues/1', '/halls/1', '/sectors/1', '/movies/1', '/screenings/1']) {
    const deleted = await api('DELETE', path, undefined, adminToken);
    assert.equal(deleted.status, 409, `${path} törlése függőséggel ütközzön`);
    assert.equal(deleted.json.code, 'HAS_DEPENDENCIES');
  }
});
