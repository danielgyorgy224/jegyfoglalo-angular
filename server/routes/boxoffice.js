'use strict';

const crypto = require('crypto');

const MAX_SEATS = 10;
const ALLOW_PAST = process.env.ALLOW_PAST_SCREENINGS === '1';

class BoxOfficeError extends Error {
  constructor(status, message, code, extra = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}

const wrap = (fn) => (req, res, next) => {
  Promise.resolve().then(() => fn(req, res, next)).catch((err) => {
    if (err instanceof BoxOfficeError) {
      return res.status(err.status).json({ error: err.message, code: err.code, ...err.extra });
    }
    next(err);
  });
};

const badRequest = (message = 'Hibás kérés.') => new BoxOfficeError(400, message, 'BAD_REQUEST');
const notFound = (message, code = 'NOT_FOUND') => new BoxOfficeError(404, message, code);
const conflict = (message, code, extra = {}) => new BoxOfficeError(409, message, code, extra);

module.exports = (server, router, ctx) => {
  const db = router.db;
  const requireCashier = ctx.requireRole('cashier', 'admin');
  const state = () => db.getState();
  const nextId = (collection) =>
    db.get(collection).value().reduce((max, item) => Math.max(max, Number(item.id) || 0), 0) + 1;
  const randomCode = (length, alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789') =>
    Array.from(crypto.randomBytes(length), (byte) => alphabet[byte % alphabet.length]).join('');

  function parseSeatRequest(body) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw badRequest();
    const screeningId = Number(body.screeningId);
    if (!Number.isSafeInteger(screeningId) || screeningId < 1) {
      throw badRequest('Érvénytelen előadásazonosító.');
    }
    if (!Array.isArray(body.seatIds) || body.seatIds.length < 1 || body.seatIds.length > MAX_SEATS) {
      throw badRequest(`Egyszerre 1–${MAX_SEATS} szék választható.`);
    }
    const seatIds = body.seatIds.map(Number);
    if (seatIds.some((id) => !Number.isSafeInteger(id) || id < 1) || new Set(seatIds).size !== seatIds.length) {
      throw badRequest('Érvénytelen vagy ismétlődő székazonosító.');
    }
    return { screeningId, seatIds };
  }

  function parseCustomer(body) {
    if (typeof body.customerName !== 'string' || typeof body.customerContact !== 'string') {
      throw badRequest('A vásárló nevét és elérhetőségét is add meg.');
    }
    const customerName = body.customerName.trim();
    const customerContact = body.customerContact.trim();
    if (customerName.length < 2 || customerName.length > 100) {
      throw badRequest('A név 2–100 karakter legyen.');
    }
    if (customerContact.length < 3 || customerContact.length > 120) {
      throw badRequest('Adj meg e-mail-címet vagy telefonszámot.');
    }
    return { customerName, customerContact };
  }

  function parsePaymentMethod(body) {
    if (!body || !['cash', 'card'].includes(body.paymentMethod)) {
      throw badRequest('A fizetési mód csak cash vagy card lehet.');
    }
    return body.paymentMethod;
  }

  function screeningContext(screeningId) {
    const current = state();
    const screening = current.screenings.find((item) => item.id === screeningId);
    if (!screening) throw notFound('Az előadás nem található.', 'SCREENING_NOT_FOUND');
    const movie = current.movies.find((item) => item.id === screening.movieId);
    const hall = current.halls.find((item) => item.id === screening.hallId);
    const venue = hall && current.venues.find((item) => item.id === hall.venueId);
    return { screening, movie, hall, venue };
  }

  function assertBookable(screeningId, seatIds, ignoredReservationId = null) {
    ctx.seats.purgeExpiredLocks(db);
    const context = screeningContext(screeningId);
    const screening = context.screening;
    if (screening.status !== 'active' || (!ALLOW_PAST && new Date(screening.startsAt) <= new Date())) {
      throw conflict('Az előadásra nem lehet jegyet váltani.', 'SCREENING_CLOSED');
    }

    const current = state();
    const statusState = ignoredReservationId === null
      ? current
      : {
        ...current,
        reservations: current.reservations.filter((reservation) => reservation.id !== ignoredReservationId),
      };
    const statuses = ctx.seats.computeStatuses(statusState, screening);
    const availability = ctx.seats.checkAvailability(statuses, seatIds);
    if (availability.unknown.length) {
      throw new BoxOfficeError(
        400,
        'A kiválasztott szék nem ehhez az előadáshoz tartozik.',
        'UNKNOWN_SEAT',
        { seatIds: availability.unknown },
      );
    }
    if (!availability.ok) {
      throw conflict('Néhány kiválasztott hely már nem szabad.', 'SEAT_UNAVAILABLE', {
        seatIds: availability.unavailable,
      });
    }

    const hallSeats = current.seats.filter((seat) => seat.hallId === screening.hallId);
    const priceMap = ctx.pricing.buildPriceMap(hallSeats, screening, current.priceOverrides);
    const total = ctx.pricing.calcTotal(seatIds, priceMap);
    const seats = seatIds.map((id) => ({
      id,
      label: current.seats.find((seat) => seat.id === id)?.label ?? String(id),
      price: priceMap.get(id).price,
    }));
    return {
      ...context,
      priceMap,
      total,
      seats,
      summary: {
        screeningId: screening.id,
        startsAt: screening.startsAt,
        movieTitle: context.movie?.title ?? '',
        movieType: context.movie?.type ?? 'film',
        venueName: context.venue?.name ?? '',
        venueAddress: context.venue ? `${context.venue.city}, ${context.venue.address}` : '',
        hallName: context.hall?.name ?? '',
      },
    };
  }

  function makeSale({ screeningId, seatIds, paymentMethod, context, reservation = null, createdBy }) {
    const id = nextId('sales');
    return {
      id,
      screeningId,
      channel: 'cashier',
      paymentMethod,
      reservationId: reservation?.id ?? null,
      tickets: seatIds.map((seatId, index) => ({
        seatId,
        price: context.priceMap.get(seatId).price,
        ticketCode: `TK-${id}-${index + 1}`,
      })),
      ticketCount: seatIds.length,
      total: context.total,
      paymentRef: null,
      status: 'paid',
      createdAt: new Date().toISOString(),
      createdBy,
      ...(reservation ? {
        customerName: reservation.customerName,
        customerContact: reservation.customerContact,
      } : {}),
    };
  }

  server.get('/box-office/reservations', requireCashier, wrap((req, res) => {
    const query = typeof req.query.query === 'string' ? req.query.query.trim() : '';
    if (query.length < 2 || query.length > 100) {
      throw badRequest('A kereséshez legalább 2, legfeljebb 100 karaktert adj meg.');
    }
    const normalized = query.toLocaleLowerCase();
    const current = state();
    const screenings = new Map(current.screenings.map((item) => [item.id, item]));
    const movies = new Map(current.movies.map((item) => [item.id, item]));
    const halls = new Map(current.halls.map((item) => [item.id, item]));
    const venues = new Map(current.venues.map((item) => [item.id, item]));
    const seats = new Map(current.seats.map((item) => [item.id, item]));
    const items = current.reservations
      .filter((reservation) => reservation.code.toLocaleLowerCase().includes(normalized)
        || reservation.customerName.toLocaleLowerCase().includes(normalized))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 50)
      .map((reservation) => {
        const screening = screenings.get(reservation.screeningId);
        const movie = screening && movies.get(screening.movieId);
        const hall = screening && halls.get(screening.hallId);
        const venue = hall && venues.get(hall.venueId);
        return {
          id: reservation.id,
          code: reservation.code,
          status: reservation.status,
          channel: reservation.channel,
          customerName: reservation.customerName,
          customerContact: reservation.customerContact,
          createdAt: reservation.createdAt,
          screeningId: reservation.screeningId,
          movieTitle: movie?.title ?? '',
          startsAt: screening?.startsAt ?? null,
          venueName: venue?.name ?? '',
          hallName: hall?.name ?? '',
          seatIds: reservation.seatIds,
          seatLabels: reservation.seatIds.map((id) => seats.get(id)?.label ?? String(id)),
        };
      });
    res.json({ items, count: items.length });
  }));

  server.post('/box-office/reservations', requireCashier, wrap(async (req, res) => {
    const input = parseSeatRequest(req.body);
    const customer = parseCustomer(req.body);
    const result = await ctx.seats.withMutex(() => {
      const context = assertBookable(input.screeningId, input.seatIds);
      let code;
      do {
        code = `FG-${randomCode(6)}`;
      } while (state().reservations.some((reservation) => reservation.code === code));
      const reservation = {
        id: nextId('reservations'),
        code,
        screeningId: input.screeningId,
        seatIds: input.seatIds,
        status: 'active',
        channel: 'cashier',
        customerName: customer.customerName,
        customerContact: customer.customerContact,
        createdAt: new Date().toISOString(),
        createdBy: req.user.id,
      };
      db.get('reservations').push(reservation).write();
      return { reservation, context };
    });

    res.status(201).json({
      id: result.reservation.id,
      code: result.reservation.code,
      status: result.reservation.status,
      channel: result.reservation.channel,
      createdAt: result.reservation.createdAt,
      customerName: result.reservation.customerName,
      seats: result.context.seats,
      total: result.context.total,
      ...result.context.summary,
    });
  }));

  server.post('/box-office/sales', requireCashier, wrap(async (req, res) => {
    const input = parseSeatRequest(req.body);
    const paymentMethod = parsePaymentMethod(req.body);
    const sale = await ctx.seats.withMutex(() => {
      const context = assertBookable(input.screeningId, input.seatIds);
      const document = makeSale({
        ...input,
        paymentMethod,
        context,
        createdBy: req.user.id,
      });
      db.get('sales').push(document).write();
      return document;
    });
    res.status(201).json(sale);
  }));

  server.post('/box-office/reservations/:id/issue', requireCashier, wrap(async (req, res) => {
    const reservationId = Number(req.params.id);
    if (!Number.isSafeInteger(reservationId) || reservationId < 1) {
      throw badRequest('Érvénytelen foglalásazonosító.');
    }
    const paymentMethod = parsePaymentMethod(req.body);
    const sale = await ctx.seats.withMutex(() => {
      const reservation = state().reservations.find((item) => item.id === reservationId);
      if (!reservation) throw notFound('A foglalás nem található.', 'RESERVATION_NOT_FOUND');
      if (reservation.status !== 'active') {
        throw conflict('Csak aktív foglalásból állítható ki jegy.', 'RESERVATION_NOT_ACTIVE');
      }
      const context = assertBookable(reservation.screeningId, reservation.seatIds, reservation.id);
      const document = makeSale({
        screeningId: reservation.screeningId,
        seatIds: reservation.seatIds,
        paymentMethod,
        context,
        reservation,
        createdBy: req.user.id,
      });
      db.get('sales').push(document).write();
      db.get('reservations').find({ id: reservation.id }).assign({ status: 'converted' }).write();
      return document;
    });
    res.status(201).json(sale);
  }));

  server.post('/box-office/reservations/:id/cancel', requireCashier, wrap(async (req, res) => {
    const reservationId = Number(req.params.id);
    if (!Number.isSafeInteger(reservationId) || reservationId < 1) {
      throw badRequest('Érvénytelen foglalásazonosító.');
    }
    const reservation = await ctx.seats.withMutex(() => {
      const current = state().reservations.find((item) => item.id === reservationId);
      if (!current) throw notFound('A foglalás nem található.', 'RESERVATION_NOT_FOUND');
      if (current.status !== 'active') {
        throw conflict('Csak aktív foglalás mondható le.', 'RESERVATION_NOT_ACTIVE');
      }
      const updated = { ...current, status: 'cancelled' };
      db.get('reservations').find({ id: reservationId }).assign({ status: 'cancelled' }).write();
      return updated;
    });
    res.json(reservation);
  }));
};
