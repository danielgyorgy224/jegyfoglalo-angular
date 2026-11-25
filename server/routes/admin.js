'use strict';

const MAX_POSTER_BYTES = 1024 * 1024;
const USER_FIELDS = new Set(['name', 'email', 'password', 'role', 'active']);

class AdminError extends Error {
  constructor(status, message, code, extra = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}

const wrap = (fn) => (req, res, next) => {
  Promise.resolve().then(() => fn(req, res, next)).catch((err) => {
    if (err instanceof AdminError) {
      return res.status(err.status).json({ error: err.message, code: err.code, ...err.extra });
    }
    next(err);
  });
};

const badRequest = (message = 'Hibás kérés.') => new AdminError(400, message, 'BAD_REQUEST');
const notFound = (message) => new AdminError(404, message, 'NOT_FOUND');
const conflict = (message, code = 'HAS_DEPENDENCIES', extra = {}) =>
  new AdminError(409, message, code, extra);

module.exports = (server, router, ctx) => {
  const db = router.db;
  const requireAdmin = ctx.requireRole('admin');
  const state = () => db.getState();
  const nextId = (collection) =>
    db.get(collection).value().reduce((max, item) => Math.max(max, Number(item.id) || 0), 0) + 1;
  const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
  const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

  function parseId(value, label = 'Azonosító') {
    const id = Number(value);
    if (!Number.isSafeInteger(id) || id < 1) throw badRequest(`Érvénytelen ${label.toLowerCase()}.`);
    return id;
  }

  function safeUser(user) {
    const { passwordHash, ...result } = user;
    return result;
  }

  function parseUser(body, current, creating, replacing) {
    if (!isRecord(body)) throw badRequest('A felhasználó adatai hibásak.');
    if (Object.keys(body).some((key) => !USER_FIELDS.has(key))) {
      throw badRequest('A felhasználó csak a támogatott mezőket tartalmazhatja.');
    }

    const value = { ...(current || {}) };
    if (creating || replacing) {
      for (const field of ['name', 'email', 'role']) {
        if (!hasOwn(body, field)) throw badRequest('Név, e-mail-cím és szerepkör megadása kötelező.');
      }
    }

    if (hasOwn(body, 'name')) {
      if (typeof body.name !== 'string') throw badRequest('A név szöveges érték legyen.');
      const name = body.name.trim();
      if (name.length < 2 || name.length > 100) throw badRequest('A név 2–100 karakter legyen.');
      value.name = name;
    }
    if (hasOwn(body, 'email')) {
      if (typeof body.email !== 'string') throw badRequest('Az e-mail-cím szöveges érték legyen.');
      const email = body.email.trim().toLowerCase();
      if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        throw badRequest('Érvénytelen e-mail-cím.');
      }
      value.email = email;
    }
    if (hasOwn(body, 'role')) {
      if (!['admin', 'cashier'].includes(body.role)) throw badRequest('Érvénytelen szerepkör.');
      value.role = body.role;
    }
    if (hasOwn(body, 'active')) {
      if (typeof body.active !== 'boolean') throw badRequest('Az aktív állapot logikai érték legyen.');
      value.active = body.active;
    } else if (creating) {
      value.active = true;
    }
    if (hasOwn(body, 'password')) {
      if (typeof body.password !== 'string' || body.password.length < 8 || body.password.length > 200) {
        throw badRequest('A jelszó 8–200 karakter legyen.');
      }
      value.passwordHash = ctx.auth.hashPassword(body.password);
    } else if (creating) {
      throw badRequest('Jelszó megadása kötelező.');
    }
    return value;
  }

  function assertUniqueEmail(email, exceptId) {
    const duplicate = state().users.some(
      (user) => user.id !== exceptId && String(user.email).toLowerCase() === email,
    );
    if (duplicate) throw conflict('Ezzel az e-mail-címmel már létezik felhasználó.', 'EMAIL_TAKEN');
  }

  function protectLastAdmin(current, updated) {
    if (current.role !== 'admin' || !current.active || (updated.role === 'admin' && updated.active)) return;
    const anotherActiveAdmin = state().users.some(
      (user) => user.id !== current.id && user.role === 'admin' && user.active,
    );
    if (!anotherActiveAdmin) {
      throw conflict('Az utolsó aktív adminisztrátor nem inaktiválható és nem fokozható le.', 'LAST_ADMIN');
    }
  }

  const userCreate = wrap((req, res) => {
    const user = parseUser(req.body, null, true, false);
    assertUniqueEmail(user.email);
    user.id = nextId('users');
    user.createdAt = new Date().toISOString();
    db.get('users').push(user).write();
    res.status(201).json(safeUser(user));
  });

  const userUpdate = (replacing) => wrap((req, res) => {
    const id = parseId(req.params.id, 'felhasználóazonosító');
    const current = state().users.find((user) => user.id === id);
    if (!current) throw notFound('A felhasználó nem található.');
    const updated = parseUser(req.body, current, false, replacing);
    assertUniqueEmail(updated.email, id);
    protectLastAdmin(current, updated);
    db.get('users').find({ id }).assign(updated).write();
    res.json(safeUser(updated));
  });

  server.post('/users', requireAdmin, userCreate);
  server.put('/users/:id', requireAdmin, userUpdate(true));
  server.patch('/users/:id', requireAdmin, userUpdate(false));
  server.delete('/users', requireAdmin, (_req, res) => res.status(405).json({
    error: 'Felhasználó törlése helyett használd az inaktiválást.',
    code: 'METHOD_NOT_ALLOWED',
  }));
  server.delete('/users/:id', requireAdmin, (_req, res) => res.status(405).json({
    error: 'Felhasználó törlése helyett használd a PATCH active:false műveletet.',
    code: 'METHOD_NOT_ALLOWED',
  }));

  server.post('/admin/halls/:hallId/seats/generate', requireAdmin, wrap(async (req, res) => {
    const hallId = parseId(req.params.hallId, 'teremazonosító');
    const body = req.body;
    if (!isRecord(body) || !Array.isArray(body.sectors) || body.sectors.length < 1 || body.sectors.length > 100) {
      throw badRequest('Adj meg legalább egy, legfeljebb 100 szektort.');
    }

    const sectorNames = new Set();
    let totalSeats = 0;
    const definitions = body.sectors.map((sector) => {
      if (!isRecord(sector)) throw badRequest('Érvénytelen szektoradat.');
      const name = typeof sector.name === 'string' ? sector.name.trim() : '';
      if (!name || name.length > 80 || sectorNames.has(name.toLocaleLowerCase())) {
        throw badRequest('A szektornevek legyenek egyediek és 1–80 karakter hosszúak.');
      }
      sectorNames.add(name.toLocaleLowerCase());
      if (!Array.isArray(sector.rows) || sector.rows.length < 1 || sector.rows.length > 100) {
        throw badRequest('Minden szektorhoz 1–100 sort adj meg.');
      }
      const rows = sector.rows.map((row) => typeof row === 'string' ? row.trim() : '');
      if (rows.some((row) => !row || row.length > 10) || new Set(rows).size !== rows.length) {
        throw badRequest('A sorok legyenek egyediek és 1–10 karakter hosszúak.');
      }
      if (!Number.isInteger(sector.seatsPerRow) || sector.seatsPerRow < 1 || sector.seatsPerRow > 100) {
        throw badRequest('A soronkénti székszám 1–100 közötti egész szám legyen.');
      }
      totalSeats += rows.length * sector.seatsPerRow;
      return { name, rows, seatsPerRow: sector.seatsPerRow };
    });
    if (totalSeats > 5000) throw badRequest('Egy művelet legfeljebb 5000 széket hozhat létre.');

    const created = await ctx.seats.withMutex(() => {
      const current = state();
      if (!current.halls.some((hall) => hall.id === hallId)) throw notFound('A terem nem található.');
      if (current.sectors.some((sector) => sector.hallId === hallId)
        || current.seats.some((seat) => seat.hallId === hallId)) {
        throw conflict('A teremhez már tartozik ülésrács.', 'SEAT_GRID_EXISTS');
      }

      let sectorId = nextId('sectors');
      let seatId = nextId('seats');
      const sectors = [];
      const seats = [];
      for (const definition of definitions) {
        const id = sectorId++;
        sectors.push({ id, hallId, name: definition.name, rows: definition.rows });
        for (const row of definition.rows) {
          for (let number = 1; number <= definition.seatsPerRow; number++) {
            seats.push({
              id: seatId++,
              hallId,
              sectorId: id,
              row,
              number,
              label: `${row}${number}`,
              disabled: false,
            });
          }
        }
      }
      db.get('sectors').push(...sectors).write();
      db.get('seats').push(...seats).write();
      return { sectors, seats };
    });
    res.status(201).json(created);
  }));

  function futureSeatReferences(seatId) {
    const current = state();
    const futureScreenings = new Set(
      current.screenings
        .filter((screening) => new Date(screening.startsAt) > new Date())
        .map((screening) => screening.id),
    );
    const reservationScreenings = current.reservations
      .filter((reservation) => reservation.status === 'active'
        && futureScreenings.has(reservation.screeningId)
        && reservation.seatIds.includes(seatId))
      .map((reservation) => reservation.screeningId);
    const saleScreenings = current.sales
      .filter((sale) => sale.status === 'paid'
        && futureScreenings.has(sale.screeningId)
        && sale.tickets.some((ticket) => ticket.seatId === seatId))
      .map((sale) => sale.screeningId);
    return [...new Set([...reservationScreenings, ...saleScreenings])];
  }

  server.patch('/seats/:id/disable', requireAdmin, wrap(async (req, res) => {
    const id = parseId(req.params.id, 'székazonosító');
    const reason = req.body?.disabledReason;
    if (reason !== undefined && (typeof reason !== 'string' || reason.length > 500)) {
      throw badRequest('A letiltás indoka legfeljebb 500 karakter lehet.');
    }
    const seat = await ctx.seats.withMutex(() => {
      const current = state().seats.find((item) => item.id === id);
      if (!current) throw notFound('A szék nem található.');
      const screeningIds = futureSeatReferences(id);
      // 409: a jövőbeli foglalás/jegy maradjon érvényes; a szék csak ezek rendezése után tiltható le.
      if (screeningIds.length) {
        throw conflict('A székhez jövőbeli foglalás vagy eladott jegy tartozik.', 'SEAT_HAS_FUTURE_BOOKINGS', {
          screeningIds,
        });
      }
      const updated = { disabled: true, disabledReason: reason?.trim() || null };
      db.get('seats').find({ id }).assign(updated).write();
      return { ...current, ...updated };
    });
    res.json(seat);
  }));

  server.patch('/seats/:id/enable', requireAdmin, wrap(async (req, res) => {
    const id = parseId(req.params.id, 'székazonosító');
    const seat = await ctx.seats.withMutex(() => {
      const current = state().seats.find((item) => item.id === id);
      if (!current) throw notFound('A szék nem található.');
      db.get('seats').find({ id }).assign({ disabled: false, disabledReason: null }).write();
      return { ...current, disabled: false, disabledReason: null };
    });
    res.json(seat);
  }));

  function parsePriceMap(value, label) {
    if (value === undefined) return {};
    if (!isRecord(value)) throw badRequest(`A(z) ${label} árak formátuma hibás.`);
    const result = [];
    for (const [rawId, price] of Object.entries(value)) {
      const targetId = parseId(rawId, `${label} célazonosító`);
      if (price !== null && (!Number.isSafeInteger(price) || price < 0)) {
        throw badRequest('Az ár nem negatív egész szám vagy null legyen.');
      }
      result.push({ targetId, price });
    }
    return result;
  }

  server.put('/screenings/:id/prices', requireAdmin, wrap(async (req, res) => {
    const id = parseId(req.params.id, 'előadásazonosító');
    const body = req.body;
    if (!isRecord(body) || !Number.isSafeInteger(body.basePrice) || body.basePrice < 0) {
      throw badRequest('Az alapár nem negatív egész szám legyen.');
    }
    const sectors = parsePriceMap(body.sectors, 'szektor');
    const seats = parsePriceMap(body.seats, 'szék');
    const result = await ctx.seats.withMutex(() => {
      const current = state();
      const screening = current.screenings.find((item) => item.id === id);
      if (!screening) throw notFound('Az előadás nem található.');
      for (const item of sectors) {
        if (!current.sectors.some((sector) => sector.id === item.targetId && sector.hallId === screening.hallId)) {
          throw badRequest('A megadott szektor nem ehhez az előadáshoz tartozik.');
        }
      }
      for (const item of seats) {
        if (!current.seats.some((seat) => seat.id === item.targetId && seat.hallId === screening.hallId)) {
          throw badRequest('A megadott szék nem ehhez az előadáshoz tartozik.');
        }
      }

      db.get('screenings').find({ id }).assign({ basePrice: body.basePrice }).write();
      for (const [scope, updates] of [['sector', sectors], ['seat', seats]]) {
        for (const { targetId, price } of updates) {
          const existing = db.get('priceOverrides').find({ screeningId: id, scope, targetId }).value();
          if (price === null) {
            if (existing) db.get('priceOverrides').remove({ id: existing.id }).write();
          } else if (existing) {
            db.get('priceOverrides').find({ id: existing.id }).assign({ price }).write();
          } else {
            db.get('priceOverrides').push({
              id: nextId('priceOverrides'),
              screeningId: id,
              scope,
              targetId,
              price,
            }).write();
          }
        }
      }
      const updatedScreening = state().screenings.find((item) => item.id === id);
      const overrides = state().priceOverrides.filter((item) => item.screeningId === id);
      return { screening: updatedScreening, priceOverrides: overrides };
    });
    res.json(result);
  }));

  server.put('/movies/:id/poster', requireAdmin, wrap((req, res) => {
    const id = parseId(req.params.id, 'filmazonosító');
    const movie = state().movies.find((item) => item.id === id);
    if (!movie) throw notFound('A film vagy esemény nem található.');
    const dataUrl = req.body?.dataUrl;
    if (typeof dataUrl !== 'string') throw badRequest('A plakát dataUrl mezője kötelező.');
    const match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataUrl);
    if (!match) throw badRequest('Csak PNG, JPEG vagy WebP formátumú plakát tölthető fel.');
    const bytes = Buffer.from(match[2], 'base64');
    if (bytes.length === 0 || bytes.length > MAX_POSTER_BYTES
      || bytes.toString('base64').replace(/=+$/, '') !== match[2].replace(/=+$/, '')) {
      throw badRequest('A plakát mérete legfeljebb 1 MB lehet, és érvényes base64 adatot kell tartalmaznia.');
    }
    db.get('movies').find({ id }).assign({ posterUrl: dataUrl }).write();
    res.json({ id, posterUrl: dataUrl });
  }));

  function hasReferences(screeningIds, seatIds) {
    const screenings = new Set(screeningIds);
    const seats = seatIds ? new Set(seatIds) : null;
    return state().reservations.some((reservation) =>
      screenings.has(reservation.screeningId) && (!seats || reservation.seatIds.some((id) => seats.has(id))))
      || state().sales.some((sale) =>
        screenings.has(sale.screeningId) && (!seats || sale.tickets.some((ticket) => seats.has(ticket.seatId))));
  }

  function protectDelete(req, collection, dependencyScreenings, seatIds) {
    const id = parseId(req.params.id);
    const item = state()[collection].find((record) => record.id === id);
    if (!item) throw notFound('A törzsadat nem található.');
    const dependencies = dependencyScreenings(item, state());
    const screeningIds = Array.isArray(dependencies) ? dependencies : dependencies.screeningIds;
    const relatedSeatIds = Array.isArray(dependencies) ? seatIds : dependencies.seatIds;
    if (hasReferences(screeningIds, relatedSeatIds)) {
      throw conflict('A törzsadat foglaláshoz vagy eladáshoz kapcsolódik.');
    }
    db.get(collection).remove({ id }).write();
    return id;
  }

  const guardedDelete = (collection, getDependencies) => [
    requireAdmin,
    wrap((req, res) => {
      protectDelete(req, collection, getDependencies);
      res.status(204).end();
    }),
  ];

  server.delete('/venues/:id', ...guardedDelete('venues', (venue, current) => {
    const hallIds = new Set(current.halls.filter((hall) => hall.venueId === venue.id).map((hall) => hall.id));
    return current.screenings.filter((screening) => hallIds.has(screening.hallId)).map((screening) => screening.id);
  }));
  server.delete('/halls/:id', ...guardedDelete('halls', (hall, current) =>
    current.screenings.filter((screening) => screening.hallId === hall.id).map((screening) => screening.id)));
  server.delete('/sectors/:id', ...guardedDelete('sectors', (sector, current) => {
    const seatIds = current.seats.filter((seat) => seat.sectorId === sector.id).map((seat) => seat.id);
    const screeningIds = current.screenings.filter((screening) => screening.hallId === sector.hallId)
      .map((screening) => screening.id);
    return { screeningIds, seatIds };
  }));
  server.delete('/movies/:id', ...guardedDelete('movies', (movie, current) =>
    current.screenings.filter((screening) => screening.movieId === movie.id).map((screening) => screening.id)));
  server.delete('/screenings/:id', ...guardedDelete('screenings', (screening) => [screening.id]));
};
