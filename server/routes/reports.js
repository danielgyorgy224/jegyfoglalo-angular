'use strict';

class ReportError extends Error {
  constructor(message) {
    super(message);
    this.status = 400;
    this.code = 'BAD_REQUEST';
  }
}

const wrap = (fn) => (req, res, next) => {
  Promise.resolve().then(() => fn(req, res, next)).catch((err) => {
    if (err instanceof ReportError) {
      return res.status(err.status).json({ error: err.message, code: err.code });
    }
    next(err);
  });
};

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const ISO_DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:\d{2})$/;
const fail = (message) => { throw new ReportError(message); };

module.exports = (server, router, ctx) => {
  const db = router.db;
  const requireAdmin = ctx.requireRole('admin');

  function parseDate(value, label, endOfDate) {
    if (typeof value !== 'string' || (!DATE_ONLY.test(value) && !ISO_DATETIME.test(value))) {
      fail(`A(z) ${label} dátum ISO formátumú legyen.`);
    }
    const datePart = value.slice(0, 10);
    const dateCheck = new Date(`${datePart}T00:00:00.000Z`);
    if (!Number.isFinite(dateCheck.getTime()) || dateCheck.toISOString().slice(0, 10) !== datePart) {
      fail(`Érvénytelen ${label} dátum.`);
    }
    if (DATE_ONLY.test(value)) {
      return endOfDate
        ? Date.parse(`${value}T23:59:59.999Z`)
        : Date.parse(`${value}T00:00:00.000Z`);
    }
    const timestamp = Date.parse(value);
    if (!Number.isFinite(timestamp)) fail(`Érvénytelen ${label} dátum.`);
    return timestamp;
  }

  function parseOptionalId(query, key) {
    const value = query[key];
    if (value === undefined) return null;
    if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) {
      fail(`A(z) ${key} pozitív egész szám legyen.`);
    }
    const id = Number(value);
    if (!Number.isSafeInteger(id)) fail(`A(z) ${key} túl nagy.`);
    return id;
  }

  function parsePagination(query) {
    const requested = query.page !== undefined || query.pageSize !== undefined;
    if (!requested) return null;
    const parse = (value, fallback, label, max = Number.MAX_SAFE_INTEGER) => {
      if (value === undefined) return fallback;
      if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) {
        fail(`A(z) ${label} pozitív egész szám legyen.`);
      }
      const number = Number(value);
      if (!Number.isSafeInteger(number) || number > max) {
        fail(`A(z) ${label} legfeljebb ${max} lehet.`);
      }
      return number;
    };
    return {
      page: parse(query.page, 1, 'page'),
      pageSize: parse(query.pageSize, 50, 'pageSize', 100),
    };
  }

  function readFilters(query) {
    const from = query.from === undefined ? null : parseDate(query.from, 'from', false);
    const to = query.to === undefined ? null : parseDate(query.to, 'to', true);
    if (from !== null && to !== null && from > to) fail('A from dátum nem lehet később, mint a to dátum.');

    const channel = query.channel;
    if (channel !== undefined && !['online', 'cashier'].includes(channel)) {
      fail('A channel csak online vagy cashier lehet.');
    }
    const status = query.status;
    if (status !== undefined && (typeof status !== 'string' || !status.trim() || status.length > 50)) {
      fail('Érvénytelen status szűrő.');
    }
    return {
      from,
      to,
      venueId: parseOptionalId(query, 'venueId'),
      screeningId: parseOptionalId(query, 'screeningId'),
      movieId: parseOptionalId(query, 'movieId'),
      channel,
      status,
      pagination: parsePagination(query),
    };
  }

  function enrich(record, type, indexes) {
    const screening = indexes.screenings.get(record.screeningId);
    const movie = screening && indexes.movies.get(screening.movieId);
    const hall = screening && indexes.halls.get(screening.hallId);
    const venue = hall && indexes.venues.get(hall.venueId);
    const seatIds = type === 'reservations'
      ? record.seatIds
      : record.tickets.map((ticket) => ticket.seatId);
    const seats = seatIds.map((id) => ({
      id,
      label: indexes.seats.get(id)?.label ?? String(id),
    }));
    return {
      ...record,
      ...(type === 'sales' ? {
        tickets: record.tickets.map((ticket) => ({
          ...ticket,
          seatLabel: indexes.seats.get(ticket.seatId)?.label ?? String(ticket.seatId),
        })),
      } : {}),
      movieTitle: movie?.title ?? '',
      venue: venue ? {
        id: venue.id,
        name: venue.name,
        city: venue.city,
        address: venue.address,
      } : null,
      venueName: venue?.name ?? '',
      hall: hall ? { id: hall.id, name: hall.name } : null,
      hallName: hall?.name ?? '',
      startsAt: screening?.startsAt ?? null,
      seats,
      seatLabels: seats.map((seat) => seat.label),
    };
  }

  function buildReport(type) {
    return wrap((req, res) => {
      const filters = readFilters(req.query);
      const state = db.getState();
      const indexes = {
        screenings: new Map(state.screenings.map((item) => [item.id, item])),
        movies: new Map(state.movies.map((item) => [item.id, item])),
        halls: new Map(state.halls.map((item) => [item.id, item])),
        venues: new Map(state.venues.map((item) => [item.id, item])),
        seats: new Map(state.seats.map((item) => [item.id, item])),
      };
      const source = state[type];
      const matched = source.filter((record) => {
        const screening = indexes.screenings.get(record.screeningId);
        const hall = screening && indexes.halls.get(screening.hallId);
        const createdAt = Date.parse(record.createdAt);
        if (filters.from !== null && (!Number.isFinite(createdAt) || createdAt < filters.from)) return false;
        if (filters.to !== null && (!Number.isFinite(createdAt) || createdAt > filters.to)) return false;
        if (filters.venueId !== null && hall?.venueId !== filters.venueId) return false;
        if (filters.screeningId !== null && record.screeningId !== filters.screeningId) return false;
        if (filters.movieId !== null && screening?.movieId !== filters.movieId) return false;
        if (filters.channel !== undefined && record.channel !== filters.channel) return false;
        if (filters.status !== undefined && record.status !== filters.status) return false;
        return true;
      });

      const paid = type === 'sales' ? matched.filter((sale) => sale.status === 'paid') : [];
      const count = type === 'sales'
        ? paid.reduce((sum, sale) => sum + sale.tickets.length, 0)
        : matched.length;
      const totalRevenue = paid.reduce((sum, sale) => sum + sale.total, 0);
      const pageItems = filters.pagination
        ? matched.slice(
          (filters.pagination.page - 1) * filters.pagination.pageSize,
          filters.pagination.page * filters.pagination.pageSize,
        )
        : matched;
      res.json({
        items: pageItems.map((record) => enrich(record, type, indexes)),
        count,
        totalRevenue,
      });
    });
  }

  server.get('/reservations', requireAdmin, buildReport('reservations'));
  server.get('/sales', requireAdmin, buildReport('sales'));
};
