'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { hashPassword } = require('../middleware/auth');

const PORT = 3993;
const BASE = `http://localhost:${PORT}`;
const customer = { customerName: 'Teszt Elek', customerContact: 'teszt@example.test' };
let proc, tmp, cashierToken, adminToken, viewerToken;

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

const freeSeat = async (screeningId) => {
  const { json } = await api('GET', `/screenings/${screeningId}/seatmap`);
  const seat = json.seats.find((item) => item.status === 'free');
  assert.ok(seat, `A(z) ${screeningId}. előadáshoz legyen szabad szék.`);
  return { seat, prices: json.prices };
};

before(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vigado-boxoffice-'));
  const dbFile = path.join(tmp, 'db.json');
  fs.copyFileSync(path.join(__dirname, '..', 'db.json'), dbFile);
  const db = JSON.parse(fs.readFileSync(dbFile, 'utf8'));
  db.users.push({
    id: Math.max(...db.users.map((user) => user.id)) + 1,
    name: 'Teszt megtekintő',
    email: 'megtekinto@vigado.test',
    passwordHash: hashPassword('Megtekinto123!'),
    role: 'viewer',
    active: true,
    createdAt: new Date().toISOString(),
  });
  db.screenings.find((screening) => screening.id === 10).status = 'closed';
  fs.writeFileSync(dbFile, JSON.stringify(db, null, 2));
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
  assert.equal(ready, true, 'A pénztári tesztszerver nem indult el.');

  const cashier = await api('POST', '/auth/login', {
    email: 'penztaros@vigado.test',
    password: 'Penztar123!',
  });
  const admin = await api('POST', '/auth/login', {
    email: 'admin@vigado.test',
    password: 'Admin123!',
  });
  const viewer = await api('POST', '/auth/login', {
    email: 'megtekinto@vigado.test',
    password: 'Megtekinto123!',
  });
  assert.equal(cashier.status, 200);
  assert.equal(admin.status, 200);
  assert.equal(viewer.status, 200);
  cashierToken = cashier.json.token;
  adminToken = admin.json.token;
  viewerToken = viewer.json.token;
});

after(() => {
  proc?.kill();
  if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
});

test('pénztári végpontok: 401 token nélkül, 403 nem engedélyezett szerepkörnek', async () => {
  const { seat } = await freeSeat(1);
  const body = { screeningId: 1, seatIds: [seat.id], ...customer, paymentMethod: 'cash' };
  assert.equal((await api('POST', '/box-office/sales', body)).status, 401);
  assert.equal((await api('POST', '/box-office/reservations', body, viewerToken)).status, 403);
  const reserved = await api('POST', '/box-office/reservations', body, cashierToken);
  assert.equal(reserved.status, 201);
  assert.equal(reserved.json.channel, 'cashier');
  assert.equal(reserved.json.createdBy, undefined);
  assert.match(reserved.json.code, /^FG-[A-Z0-9]{6}$/);
  const storedDb = JSON.parse(fs.readFileSync(path.join(tmp, 'db.json'), 'utf8'));
  const storedReservation = storedDb.reservations.find((reservation) => reservation.id === reserved.json.id);
  assert.equal(storedReservation.createdBy, 2);
});

test('online és pénztári foglalás kölcsönösen kizárja ugyanazt a széket', async () => {
  const onlineSeat = await freeSeat(1);
  const online = await api('POST', '/reservations', {
    screeningId: 1,
    seatIds: [onlineSeat.seat.id],
    ...customer,
  });
  assert.equal(online.status, 201);
  const cashierAfterOnline = await api('POST', '/box-office/sales', {
    screeningId: 1,
    seatIds: [onlineSeat.seat.id],
    paymentMethod: 'cash',
  }, cashierToken);
  assert.equal(cashierAfterOnline.status, 409);
  assert.equal(cashierAfterOnline.json.code, 'SEAT_UNAVAILABLE');
  assert.deepEqual(cashierAfterOnline.json.seatIds, [onlineSeat.seat.id]);

  const cashierSeat = await freeSeat(2);
  const cashierReservation = await api('POST', '/box-office/reservations', {
    screeningId: 2,
    seatIds: [cashierSeat.seat.id],
    ...customer,
  }, cashierToken);
  assert.equal(cashierReservation.status, 201);
  const onlineAfterCashier = await api('POST', '/reservations', {
    screeningId: 2,
    seatIds: [cashierSeat.seat.id],
    ...customer,
  });
  assert.equal(onlineAfterCashier.status, 409);
  assert.equal(onlineAfterCashier.json.code, 'SEAT_UNAVAILABLE');
  assert.deepEqual(onlineAfterCashier.json.seatIds, [cashierSeat.seat.id]);
});

test('pénztári eladás újraszámolja az árat, a letiltott szék és hibás adatok elutasításra kerülnek', async () => {
  const disabledMap = await api('GET', '/screenings/1/seatmap');
  const disabledSeat = disabledMap.json.seats.find((seat) => seat.status === 'disabled');
  assert.ok(disabledSeat);
  const disabledSale = await api('POST', '/box-office/sales', {
    screeningId: 1,
    seatIds: [disabledSeat.id],
    paymentMethod: 'cash',
  }, cashierToken);
  assert.equal(disabledSale.status, 409);
  assert.equal(disabledSale.json.code, 'SEAT_UNAVAILABLE');
  assert.deepEqual(disabledSale.json.seatIds, [disabledSeat.id]);

  const { seat, prices } = await freeSeat(3);
  const sale = await api('POST', '/box-office/sales', {
    screeningId: 3,
    seatIds: [seat.id],
    paymentMethod: 'card',
    total: 1,
    price: 1,
  }, cashierToken);
  assert.equal(sale.status, 201);
  assert.equal(sale.json.channel, 'cashier');
  assert.equal(sale.json.status, 'paid');
  assert.equal(sale.json.total, prices[seat.id]);
  assert.equal(sale.json.tickets[0].price, prices[seat.id]);
  assert.equal(sale.json.tickets[0].ticketCode, `TK-${sale.json.id}-1`);

  assert.equal((await api('POST', '/box-office/sales', {
    screeningId: 3,
    seatIds: [seat.id, seat.id],
    paymentMethod: 'cash',
  }, cashierToken)).status, 400);
  assert.equal((await api('POST', '/box-office/sales', {
    screeningId: 10,
    seatIds: [seat.id],
    paymentMethod: 'cash',
  }, cashierToken)).status, 409);
  assert.equal((await api('POST', '/box-office/sales', {
    screeningId: 999,
    seatIds: [seat.id],
    paymentMethod: 'cash',
  }, cashierToken)).status, 404);
});

test('aktív foglalás kiadása eladást rögzít és átváltja a foglalást', async () => {
  const { seat, prices } = await freeSeat(4);
  const created = await api('POST', '/box-office/reservations', {
    screeningId: 4,
    seatIds: [seat.id],
    ...customer,
    price: 1,
  }, cashierToken);
  assert.equal(created.status, 201);

  const issued = await api('POST', `/box-office/reservations/${created.json.id}/issue`, {
    paymentMethod: 'cash',
  }, cashierToken);
  assert.equal(issued.status, 201);
  assert.equal(issued.json.reservationId, created.json.id);
  assert.equal(issued.json.total, prices[seat.id]);
  assert.equal(issued.json.tickets[0].ticketCode, `TK-${issued.json.id}-1`);
  const unavailable = await api('POST', '/box-office/sales', {
    screeningId: 4,
    seatIds: [seat.id],
    paymentMethod: 'cash',
  }, adminToken);
  assert.equal(unavailable.status, 409);

  const cancelled = await api('POST', `/box-office/reservations/${created.json.id}/cancel`, undefined, cashierToken);
  assert.equal(cancelled.status, 409);
  assert.equal(cancelled.json.code, 'RESERVATION_NOT_ACTIVE');
});

test('foglalás lemondása felszabadítja a széket, hiányzó foglalás 404', async () => {
  const { seat } = await freeSeat(5);
  const created = await api('POST', '/box-office/reservations', {
    screeningId: 5,
    seatIds: [seat.id],
    ...customer,
  }, cashierToken);
  assert.equal(created.status, 201);
  const cancelled = await api('POST', `/box-office/reservations/${created.json.id}/cancel`, undefined, cashierToken);
  assert.equal(cancelled.status, 200);
  assert.equal(cancelled.json.status, 'cancelled');
  const online = await api('POST', '/reservations', {
    screeningId: 5,
    seatIds: [seat.id],
    ...customer,
  });
  assert.equal(online.status, 201);
  assert.equal((await api('POST', '/box-office/reservations/999/cancel', undefined, cashierToken)).status, 404);
  assert.equal((await api('POST', '/box-office/reservations/999/issue', {
    paymentMethod: 'cash',
  }, cashierToken)).status, 404);
});

test('pénztári foglaláskeresés kóddal vagy névrészlettel, csak pénztárosnak és adminnak', async () => {
  const { seat } = await freeSeat(6);
  const created = await api('POST', '/box-office/reservations', {
    screeningId: 6,
    seatIds: [seat.id],
    customerName: 'Kereshető Elemér',
    customerContact: 'keresheto@example.test',
  }, cashierToken);
  assert.equal(created.status, 201);

  const byCode = await api('GET', `/box-office/reservations?query=${created.json.code}`, undefined, cashierToken);
  assert.equal(byCode.status, 200);
  assert.equal(byCode.json.count, 1);
  assert.equal(byCode.json.items[0].code, created.json.code);
  assert.deepEqual(byCode.json.items[0].seatLabels, [seat.label]);

  const byName = await api('GET', '/box-office/reservations?query=Elem%C3%A9r', undefined, adminToken);
  assert.equal(byName.status, 200);
  assert.equal(byName.json.items[0].customerName, 'Kereshető Elemér');
  assert.equal((await api('GET', '/box-office/reservations?query=K', undefined, cashierToken)).status, 400);
  assert.equal((await api('GET', '/box-office/reservations?query=Elek')).status, 401);
  assert.equal((await api('GET', '/box-office/reservations?query=Elek', undefined, viewerToken)).status, 403);
});
