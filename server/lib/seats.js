'use strict';
/**
 * Székállapotok és a közös mutex.
 *
 * Állapotok: free | reserved | sold | disabled | locked
 *   sold      – a székre van fizetett eladás (sales.status = 'paid')
 *   reserved  – aktív foglalás (reservations.status = 'active')
 *   disabled  – seats.disabled = true (nyilvános és pénztár is kizárja)
 *   locked    – fizetés idejére zárolt (seatLocks, until > most)
 *
 * Minden foglalás / zárolás / eladás a withMutex()-en át fusson (a pénztár végpontjai is),
 * így online és pénztár sem foglalhatja le ugyanazt a széket.
 */

const LOCK_MINUTES = 10;

// ---- Mutex: egyetlen sor, a műveletek egymás után futnak ----------------------------
let tail = Promise.resolve();
function withMutex(fn) {
  const run = tail.then(() => fn());
  tail = run.catch(() => undefined); // egy hiba ne akassza meg a sort
  return run;
}

// ---- Állapotszámítás (tiszta, a db állapotát paraméterként kapja) -------------------
function isSellableStatus(status) {
  return status === 'free';
}

/**
 * Map(seatId → státusz) az adott előadás termének székeire.
 * @param state  { seats, reservations, sales, seatLocks }
 */
function computeStatuses(state, screening, now = new Date()) {
  const result = new Map();
  const sold = new Set();
  const reserved = new Set();
  const locked = new Set();

  for (const s of state.sales || []) {
    if (s.screeningId === screening.id && s.status === 'paid') s.tickets.forEach((t) => sold.add(t.seatId));
  }
  for (const r of state.reservations || []) {
    if (r.screeningId === screening.id && r.status === 'active') r.seatIds.forEach((id) => reserved.add(id));
  }
  for (const l of state.seatLocks || []) {
    if (l.screeningId === screening.id && new Date(l.until) > now) locked.add(l.seatId);
  }

  for (const seat of state.seats) {
    if (seat.hallId !== screening.hallId) continue;
    let status = 'free';
    if (sold.has(seat.id)) status = 'sold';
    else if (reserved.has(seat.id)) status = 'reserved';
    else if (seat.disabled) status = 'disabled';
    else if (locked.has(seat.id)) status = 'locked';
    result.set(seat.id, status);
  }
  return result;
}

/**
 * Ellenőrzi, hogy a kért székek mind az előadás termében vannak és szabadok.
 * @returns {{ ok: boolean, unavailable: number[], unknown: number[] }}
 */
function checkAvailability(statuses, seatIds) {
  const unknown = [];
  const unavailable = [];
  for (const id of seatIds) {
    const st = statuses.get(id);
    if (st === undefined) unknown.push(id);
    else if (!isSellableStatus(st)) unavailable.push(id);
  }
  return { ok: !unknown.length && !unavailable.length, unavailable, unknown };
}

/** Lejárt zárolások törlése a db-ből (lowdb példány). */
function purgeExpiredLocks(db, now = new Date()) {
  const before = db.get('seatLocks').size().value();
  db.get('seatLocks').remove((l) => new Date(l.until) <= now).write();
  return before - db.get('seatLocks').size().value();
}

module.exports = {
  LOCK_MINUTES,
  withMutex,
  computeStatuses,
  checkAvailability,
  isSellableStatus,
  purgeExpiredLocks,
};
